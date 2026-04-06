package dejavu;

import io.temporal.activity.ActivityOptions;
import io.temporal.common.RetryOptions;
import io.temporal.workflow.Saga;
import io.temporal.workflow.Workflow;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Saga-pattern workflow using the SDK's built-in Saga class.
 *
 * The Java SDK has first-class saga support via {@link Saga}, which manages
 * the compensation stack and execution semantics (reverse order, continue
 * on error, detached cancellation scope). This is the idiomatic Java
 * approach — other SDKs implement the pattern manually with try/catch.
 */
public class OrderWorkflowImpl implements OrderWorkflow {

    private boolean orderReady = false;
    private String status = "pending";

    @Override
    public void orderReady() {
        this.orderReady = true;
    }

    @Override
    public String getStatus() {
        return status;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Map<String, Object> run(Map<String, Object> orderInput) {
        String orderId = (String) orderInput.get("order_id");

        ActivityOptions defaultOptions = ActivityOptions.newBuilder()
                .setStartToCloseTimeout(Duration.ofSeconds(10))
                .setRetryOptions(RetryOptions.newBuilder()
                        .setMaximumAttempts(3)
                        .build())
                .build();

        ActivityOptions submitOptions = ActivityOptions.newBuilder()
                .setStartToCloseTimeout(Duration.ofSeconds(10))
                .setRetryOptions(RetryOptions.newBuilder()
                        .setInitialInterval(Duration.ofSeconds(2))
                        .setBackoffCoefficient(1.5)
                        .setMaximumInterval(Duration.ofSeconds(8))
                        .setMaximumAttempts(10)
                        .build())
                .build();

        ActivityOptions notifyOptions = ActivityOptions.newBuilder()
                .setStartToCloseTimeout(Duration.ofSeconds(10))
                .build();

        OrderActivities acts = Workflow.newActivityStub(OrderActivities.class, defaultOptions);
        OrderActivities submitActs = Workflow.newActivityStub(OrderActivities.class, submitOptions);
        OrderActivities notifyActs = Workflow.newActivityStub(OrderActivities.class, notifyOptions);

        // Build typed input
        OrderInput input = new OrderInput();
        input.setOrderId(orderId);
        input.setTotal(toDouble(orderInput.get("total")));

        List<Map<String, Object>> items = new ArrayList<>();
        Object rawItems = orderInput.get("items");
        if (rawItems instanceof List<?>) {
            for (Object item : (List<?>) rawItems) {
                if (item instanceof Map<?, ?>) {
                    items.add((Map<String, Object>) item);
                }
            }
        }
        input.setItems(items);

        // Java SDK's built-in Saga manages the compensation stack.
        // - Compensations run in reverse order on failure
        // - continueWithError: keep compensating even if one fails
        // - Runs in a detached cancellation scope automatically
        Saga saga = new Saga(new Saga.Options.Builder()
                .setParallelCompensation(false)
                .setContinueWithError(true)
                .build());

        // Holder for authorization_id — array so the lambda captures by reference
        String[] authHolder = new String[]{""};

        try {
            // Step 1: Validate Order
            status = "validating_order";
            acts.validateOrder(input);

            // Step 2: Validate Store
            status = "validating_store";
            acts.validateStore(input);

            // Step 3: Authorize Payment (hold, not capture)
            // Register compensation BEFORE executing — the hold may be placed
            // even if the activity response is lost.
            status = "authorizing_payment";
            saga.addCompensation(() -> {
                OrderInput compInput = new OrderInput();
                compInput.setOrderId(orderId);
                compInput.setTotal(input.getTotal());
                compInput.setItems(input.getItems());
                compInput.setAuthorizationId(authHolder[0]);

                OrderActivities compActs = Workflow.newActivityStub(
                        OrderActivities.class,
                        ActivityOptions.newBuilder()
                                .setStartToCloseTimeout(Duration.ofSeconds(10))
                                .setRetryOptions(RetryOptions.newBuilder()
                                        .setMaximumAttempts(5)
                                        .build())
                                .build());
                compActs.releasePaymentHold(compInput);
            });

            Map<String, Object> paymentResult = acts.authorizePayment(input);
            authHolder[0] = (String) paymentResult.get("authorization_id");

            // Step 4: Clear Cart
            status = "clearing_cart";
            acts.clearCart(input);

            // Step 5: Submit to Store
            status = "submitting_to_store";
            submitActs.submitToStore(input);

            // Step 6: Wait for order ready signal (human in the loop)
            status = "preparing";
            Workflow.await(() -> orderReady);

            // Step 7: Capture Payment
            status = "capturing_payment";
            OrderInput captureInput = new OrderInput();
            captureInput.setOrderId(orderId);
            captureInput.setTotal(input.getTotal());
            captureInput.setItems(input.getItems());
            captureInput.setAuthorizationId(authHolder[0]);
            acts.capturePayment(captureInput);

            // Notify customer of success
            status = "completed";
            OrderInput successInput = new OrderInput();
            successInput.setOrderId(orderId);
            successInput.setTotal(input.getTotal());
            successInput.setItems(input.getItems());
            successInput.setSuccess(true);
            notifyActs.notifyCustomer(successInput);

            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("order_id", orderId);
            return result;

        } catch (Exception e) {
            Workflow.getLogger(OrderWorkflowImpl.class)
                    .error("Order " + orderId + " failed: " + e.getMessage());
            status = "compensating";

            // Saga.compensate() runs all registered compensations in reverse
            // inside a detached cancellation scope automatically
            saga.compensate();

            // Notify customer of failure
            status = "failed";
            Workflow.newDetachedCancellationScope(() -> {
                OrderInput failInput = new OrderInput();
                failInput.setOrderId(orderId);
                failInput.setTotal(input.getTotal());
                failInput.setItems(input.getItems());
                failInput.setSuccess(false);
                notifyActs.notifyCustomer(failInput);
            }).run();

            Map<String, Object> result = new HashMap<>();
            result.put("success", false);
            result.put("error", e.getMessage());
            result.put("order_id", orderId);
            return result;
        }
    }

    private static double toDouble(Object value) {
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        return 0.0;
    }
}
