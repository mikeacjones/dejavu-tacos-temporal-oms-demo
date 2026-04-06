using System.Text.Json;
using Temporalio.Activities;

namespace DejaVu;

/// <summary>
/// Order processing activities. Each activity emits SSE events for the UI,
/// checks backend failure state for demo purposes, and simulates processing.
/// </summary>
public class OrderActivities
{
    private readonly BackendClient _backend;

    public OrderActivities(BackendClient backend)
    {
        _backend = backend;
    }

    private async Task EmitAsync(string orderId, string step, string status,
        string detail = "", string error = "", int attempt = 1, int maxAttempts = 1)
    {
        var evt = OrderEvent.Create(orderId, step, status);
        evt.Detail = detail;
        evt.Error = error;
        evt.Attempt = attempt;
        evt.MaxAttempts = maxAttempts;
        await _backend.EmitEventAsync(evt);
    }

    [Activity]
    public async Task<Dictionary<string, object?>> ValidateOrder(OrderInput input)
    {
        await EmitAsync(input.OrderId, "validate_order", "running");

        await Task.Delay(200);
        if (await _backend.ShouldFailAsync("validate_order"))
        {
            var attempt = ActivityExecutionContext.Current.Info.Attempt;
            await EmitAsync(input.OrderId, "validate_order", "retrying",
                attempt: attempt, maxAttempts: 3, error: "Order validation failed");
            throw new ApplicationException("order validation failed");
        }

        double total = 0;
        foreach (var item in input.Items)
        {
            var price = GetDouble(item, "price");
            var qty = GetDouble(item, "quantity", 1);
            total += price * qty;
        }

        await EmitAsync(input.OrderId, "validate_order", "completed",
            detail: $"Validated {input.Items.Count} items, total ${total:F2}");

        return new Dictionary<string, object?>
        {
            ["valid"] = true,
            ["item_count"] = input.Items.Count,
            ["total"] = total,
        };
    }

    [Activity]
    public async Task<Dictionary<string, object?>> ValidateStore(OrderInput input)
    {
        await EmitAsync(input.OrderId, "validate_store", "running");

        await Task.Delay(300);
        if (await _backend.ShouldFailAsync("validate_store"))
        {
            var attempt = ActivityExecutionContext.Current.Info.Attempt;
            await EmitAsync(input.OrderId, "validate_store", "retrying",
                attempt: attempt, maxAttempts: 3, error: "Unable to reach store");
            throw new ApplicationException("unable to reach store \u2014 connection refused");
        }

        await EmitAsync(input.OrderId, "validate_store", "completed",
            detail: "D\u00e9j\u00e0 Vu Tacos #42 is open, ~12 min wait");

        return new Dictionary<string, object?>
        {
            ["store_id"] = "store-001",
            ["name"] = "D\u00e9j\u00e0 Vu Tacos #42",
            ["estimated_wait_minutes"] = 12,
        };
    }

    [Activity]
    public async Task<Dictionary<string, object?>> AuthorizePayment(OrderInput input)
    {
        await EmitAsync(input.OrderId, "authorize_payment", "running");

        await Task.Delay(500);
        if (await _backend.ShouldFailAsync("authorize_payment"))
        {
            var attempt = ActivityExecutionContext.Current.Info.Attempt;
            await EmitAsync(input.OrderId, "authorize_payment", "retrying",
                attempt: attempt, maxAttempts: 3, error: "Payment gateway timeout");
            throw new ApplicationException("payment gateway timeout \u2014 connection refused");
        }

        var authId = $"auth_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() % 100000000}";
        await EmitAsync(input.OrderId, "authorize_payment", "completed",
            detail: $"Hold placed: ${input.Total:F2} (auth: {authId})");

        return new Dictionary<string, object?>
        {
            ["authorization_id"] = authId,
            ["amount"] = input.Total,
            ["status"] = "authorized",
        };
    }

    [Activity]
    public async Task<Dictionary<string, object?>> ClearCart(OrderInput input)
    {
        await EmitAsync(input.OrderId, "clear_cart", "running");
        await Task.Delay(100);
        await EmitAsync(input.OrderId, "clear_cart", "completed", detail: "Cart cleared");

        return new Dictionary<string, object?> { ["cleared"] = true };
    }

    [Activity]
    public async Task<Dictionary<string, object?>> SubmitToStore(OrderInput input)
    {
        var attempt = ActivityExecutionContext.Current.Info.Attempt;
        await EmitAsync(input.OrderId, "submit_to_store", "running",
            attempt: attempt, maxAttempts: 10);

        await Task.Delay(500);
        if (await _backend.ShouldFailAsync("submit_to_store"))
        {
            await EmitAsync(input.OrderId, "submit_to_store", "retrying",
                attempt: attempt, maxAttempts: 10,
                error: "Store connectivity lost \u2014 Bob accidentally unplugged the ethernet");
            throw new ApplicationException(
                "store connectivity lost \u2014 Bob accidentally unplugged the ethernet");
        }

        // Register order on KDS
        await _backend.RegisterStoreOrderAsync(input.OrderId, new Dictionary<string, object?>
        {
            ["order_id"] = input.OrderId,
            ["items"] = input.Items,
            ["total"] = input.Total,
            ["status"] = "preparing",
            ["created_at"] = DateTime.UtcNow.ToString("o"),
        });

        await EmitAsync(input.OrderId, "submit_to_store", "completed",
            attempt: attempt, maxAttempts: 10,
            detail: "Store accepted, ready in ~12 min");

        return new Dictionary<string, object?>
        {
            ["accepted"] = true,
            ["estimated_ready_minutes"] = 12,
        };
    }

    [Activity]
    public async Task<Dictionary<string, object?>> CapturePayment(OrderInput input)
    {
        await EmitAsync(input.OrderId, "capture_payment", "running");
        await Task.Delay(300);
        await EmitAsync(input.OrderId, "capture_payment", "completed",
            detail: $"Payment captured: ${input.Total:F2}");

        return new Dictionary<string, object?>
        {
            ["authorization_id"] = input.AuthorizationId,
            ["amount"] = input.Total,
            ["status"] = "captured",
        };
    }

    [Activity]
    public async Task<Dictionary<string, object?>> ReleasePaymentHold(OrderInput input)
    {
        if (string.IsNullOrEmpty(input.AuthorizationId))
        {
            return new Dictionary<string, object?> { ["status"] = "no_hold" };
        }

        await EmitAsync(input.OrderId, "release_payment_hold", "running");
        await Task.Delay(300);
        await EmitAsync(input.OrderId, "release_payment_hold", "completed",
            detail: $"Payment hold released: ${input.Total:F2} (compensation)");

        return new Dictionary<string, object?>
        {
            ["authorization_id"] = input.AuthorizationId,
            ["status"] = "released",
        };
    }

    [Activity]
    public async Task<Dictionary<string, object?>> NotifyCustomer(OrderInput input)
    {
        await Task.Delay(200);
        var success = input.Success ?? true;

        if (success)
        {
            await EmitAsync(input.OrderId, "notify_customer_success", "completed",
                detail: "Customer notified: Your order is ready for pickup!");
        }
        else
        {
            await EmitAsync(input.OrderId, "notify_customer_failure", "completed",
                detail: "Customer notified: Sorry, we couldn't process your order. Your payment hold has been released.");
        }

        return new Dictionary<string, object?>
        {
            ["notified"] = true,
            ["success"] = success,
        };
    }

    /// <summary>
    /// Safely extract a double from a dictionary value that may arrive as a JsonElement.
    /// </summary>
    private static double GetDouble(Dictionary<string, object?> dict, string key, double defaultValue = 0)
    {
        if (!dict.TryGetValue(key, out var val) || val is null)
            return defaultValue;

        if (val is double d) return d;
        if (val is int i) return i;
        if (val is long l) return l;
        if (val is float f) return f;
        if (val is JsonElement je)
        {
            if (je.TryGetDouble(out var jd)) return jd;
        }
        if (double.TryParse(val.ToString(), out var parsed)) return parsed;
        return defaultValue;
    }
}
