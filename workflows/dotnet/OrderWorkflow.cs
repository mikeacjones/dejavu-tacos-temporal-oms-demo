using Microsoft.Extensions.Logging;
using Temporalio.Common;
using Temporalio.Workflows;

namespace DejaVu;

/// <summary>
/// Order processing workflow with saga compensation.
/// Orchestrates: validation -> payment hold -> store submission -> pickup signal -> capture.
/// If store submission fails permanently, compensates by releasing the payment hold.
/// </summary>
[Workflow("OrderWorkflow")]
public class OrderWorkflow
{
    private bool _orderReady;
    private string _status = "pending";

    [WorkflowSignal("order_ready")]
    public async Task OrderReadyAsync()
    {
        _orderReady = true;
    }

    [WorkflowQuery("get_status")]
    public string GetStatus() => _status;

    [WorkflowRun]
    public async Task<Dictionary<string, object?>> RunAsync(OrderInput input)
    {
        var orderId = input.OrderId;
        var authorizationId = "";

        // Compensation stack (saga pattern): register compensation BEFORE
        // executing the step, because the step may succeed but the activity
        // could still fail (timeout, etc.) after the side-effect occurred.
        var compensations = new List<Func<Task>>();

        var defaultOptions = new ActivityOptions
        {
            StartToCloseTimeout = TimeSpan.FromSeconds(10),
            RetryPolicy = new RetryPolicy { MaximumAttempts = 3 },
        };

        var submitOptions = new ActivityOptions
        {
            StartToCloseTimeout = TimeSpan.FromSeconds(10),
            RetryPolicy = new RetryPolicy
            {
                InitialInterval = TimeSpan.FromSeconds(2),
                BackoffCoefficient = 1.5f,
                MaximumInterval = TimeSpan.FromSeconds(8),
                MaximumAttempts = 10,
            },
        };

        var compensationOptions = new ActivityOptions
        {
            StartToCloseTimeout = TimeSpan.FromSeconds(10),
            RetryPolicy = new RetryPolicy { MaximumAttempts = 5 },
        };

        var notifyOptions = new ActivityOptions
        {
            StartToCloseTimeout = TimeSpan.FromSeconds(10),
        };

        try
        {
            // Step 1: Validate Order
            _status = "validating_order";
            await Workflow.ExecuteActivityAsync(
                (OrderActivities a) => a.ValidateOrder(input), defaultOptions);

            // Step 2: Validate Store
            _status = "validating_store";
            await Workflow.ExecuteActivityAsync(
                (OrderActivities a) => a.ValidateStore(input), defaultOptions);

            // Step 3: Authorize Payment (hold, not capture)
            // Register compensation BEFORE executing — the hold may be placed
            // even if the activity response is lost. Closure captures
            // authorizationId by reference so it has the actual value at
            // compensation time.
            _status = "authorizing_payment";
            compensations.Add(async () =>
            {
                var compInput = new OrderInput
                {
                    OrderId = input.OrderId,
                    Items = input.Items,
                    Total = input.Total,
                    AuthorizationId = authorizationId,
                };
                await Workflow.ExecuteActivityAsync(
                    (OrderActivities a) => a.ReleasePaymentHold(compInput),
                    compensationOptions);
            });

            var paymentResult = await Workflow.ExecuteActivityAsync(
                (OrderActivities a) => a.AuthorizePayment(input), defaultOptions);
            authorizationId = paymentResult.TryGetValue("authorization_id", out var authVal)
                ? authVal?.ToString() ?? ""
                : "";

            // Step 4: Clear Cart
            _status = "clearing_cart";
            await Workflow.ExecuteActivityAsync(
                (OrderActivities a) => a.ClearCart(input), defaultOptions);

            // Step 5: Submit to Store — generous retry policy for demo
            _status = "submitting_to_store";
            await Workflow.ExecuteActivityAsync(
                (OrderActivities a) => a.SubmitToStore(input), submitOptions);

            // Step 6: Wait for order ready signal (human in the loop)
            _status = "preparing";
            await Workflow.WaitConditionAsync(() => _orderReady);

            // Step 7: Capture Payment (only after store confirms)
            _status = "capturing_payment";
            var captureInput = new OrderInput
            {
                OrderId = input.OrderId,
                Items = input.Items,
                Total = input.Total,
                AuthorizationId = authorizationId,
            };
            await Workflow.ExecuteActivityAsync(
                (OrderActivities a) => a.CapturePayment(captureInput), defaultOptions);

            // Notify customer of success
            _status = "completed";
            var successInput = new OrderInput
            {
                OrderId = input.OrderId,
                Items = input.Items,
                Total = input.Total,
                Success = true,
            };
            await Workflow.ExecuteActivityAsync(
                (OrderActivities a) => a.NotifyCustomer(successInput), notifyOptions);

            return new Dictionary<string, object?>
            {
                ["success"] = true,
                ["order_id"] = orderId,
            };
        }
        catch (Exception ex)
        {
            Workflow.Logger.LogError("Order {OrderId} failed: {Error}", orderId, ex.Message);
            _status = "compensating";

            // Run compensations in reverse order (saga pattern)
            for (int i = compensations.Count - 1; i >= 0; i--)
            {
                try
                {
                    await compensations[i]();
                }
                catch (Exception compEx)
                {
                    Workflow.Logger.LogError("Compensation failed: {Error}", compEx.Message);
                }
            }

            // Notify customer of failure
            _status = "failed";
            var failInput = new OrderInput
            {
                OrderId = input.OrderId,
                Items = input.Items,
                Total = input.Total,
                Success = false,
            };
            await Workflow.ExecuteActivityAsync(
                (OrderActivities a) => a.NotifyCustomer(failInput), notifyOptions);

            return new Dictionary<string, object?>
            {
                ["success"] = false,
                ["error"] = ex.Message,
                ["order_id"] = orderId,
            };
        }
    }
}
