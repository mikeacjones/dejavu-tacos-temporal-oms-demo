package dejavu;

import io.temporal.activity.Activity;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Activity implementations that communicate with the FastAPI backend via HTTP.
 * Each activity emits SSE events for the UI, checks shouldFail() for demo
 * failure injection, and simulates processing latency.
 */
public class OrderActivitiesImpl implements OrderActivities {

    private final BackendClient backend;

    public OrderActivitiesImpl(BackendClient backend) {
        this.backend = backend;
    }

    @Override
    public Map<String, Object> validateOrder(OrderInput input) {
        String orderId = input.getOrderId();
        backend.emitEvent(orderId, "validate_order", "running");

        sleep(200);

        if (backend.shouldFail("validate_order")) {
            int attempt = Activity.getExecutionContext().getInfo().getAttempt();
            backend.emitEvent(orderId, "validate_order", "retrying",
                    attempt, 3, "Order validation failed", null);
            throw Activity.wrap(new RuntimeException("Order validation failed"));
        }

        double total = 0.0;
        List<Map<String, Object>> items = input.getItems();
        if (items != null) {
            for (Map<String, Object> item : items) {
                double price = toDouble(item.get("price"));
                double qty = toDouble(item.get("quantity"));
                total += price * qty;
            }
        }

        int itemCount = items != null ? items.size() : 0;
        backend.emitEvent(orderId, "validate_order", "completed",
                String.format("Validated %d items, total $%.2f", itemCount, total));

        Map<String, Object> result = new HashMap<>();
        result.put("valid", true);
        result.put("item_count", itemCount);
        result.put("total", total);
        return result;
    }

    @Override
    public Map<String, Object> validateStore(OrderInput input) {
        String orderId = input.getOrderId();
        backend.emitEvent(orderId, "validate_store", "running");

        sleep(300);

        if (backend.shouldFail("validate_store")) {
            int attempt = Activity.getExecutionContext().getInfo().getAttempt();
            backend.emitEvent(orderId, "validate_store", "retrying",
                    attempt, 3, "Unable to reach store", null);
            throw Activity.wrap(new RuntimeException("unable to reach store \u2014 connection refused"));
        }

        backend.emitEvent(orderId, "validate_store", "completed",
                "D\u00e9j\u00e0 Vu Tacos #42 is open, ~12 min wait");

        Map<String, Object> result = new HashMap<>();
        result.put("store_id", "store-001");
        result.put("name", "D\u00e9j\u00e0 Vu Tacos #42");
        result.put("estimated_wait_minutes", 12);
        return result;
    }

    @Override
    public Map<String, Object> authorizePayment(OrderInput input) {
        String orderId = input.getOrderId();
        backend.emitEvent(orderId, "authorize_payment", "running");

        sleep(500);

        if (backend.shouldFail("authorize_payment")) {
            int attempt = Activity.getExecutionContext().getInfo().getAttempt();
            backend.emitEvent(orderId, "authorize_payment", "retrying",
                    attempt, 3, "Payment gateway timeout", null);
            throw Activity.wrap(new RuntimeException("payment gateway timeout \u2014 connection refused"));
        }

        String authId = String.format("auth_%08X", System.currentTimeMillis() % 0xFFFFFFFFL);
        backend.emitEvent(orderId, "authorize_payment", "completed",
                String.format("Hold placed: $%.2f (auth: %s)", input.getTotal(), authId));

        Map<String, Object> result = new HashMap<>();
        result.put("authorization_id", authId);
        result.put("amount", input.getTotal());
        result.put("status", "authorized");
        return result;
    }

    @Override
    public Map<String, Object> clearCart(OrderInput input) {
        String orderId = input.getOrderId();
        backend.emitEvent(orderId, "clear_cart", "running");

        sleep(100);

        backend.emitEvent(orderId, "clear_cart", "completed", "Cart cleared");

        Map<String, Object> result = new HashMap<>();
        result.put("cleared", true);
        return result;
    }

    @Override
    public Map<String, Object> submitToStore(OrderInput input) {
        String orderId = input.getOrderId();
        int attempt = Activity.getExecutionContext().getInfo().getAttempt();
        backend.emitEvent(orderId, "submit_to_store", "running", attempt, 10, null, null);

        sleep(500);

        if (backend.shouldFail("submit_to_store")) {
            backend.emitEvent(orderId, "submit_to_store", "retrying",
                    attempt, 10,
                    "Store connectivity lost \u2014 Bob accidentally unplugged the ethernet", null);
            throw Activity.wrap(new RuntimeException(
                    "Store connectivity lost \u2014 Bob accidentally unplugged the ethernet"));
        }

        // Register order on kitchen display
        Map<String, Object> storeData = new HashMap<>();
        storeData.put("order_id", orderId);
        storeData.put("items", input.getItems());
        storeData.put("total", input.getTotal());
        storeData.put("status", "preparing");
        storeData.put("created_at", Instant.now().toString());
        backend.registerStoreOrder(orderId, storeData);

        backend.emitEvent(orderId, "submit_to_store", "completed",
                attempt, 10, null, "Store accepted, ready in ~12 min");

        Map<String, Object> result = new HashMap<>();
        result.put("accepted", true);
        result.put("estimated_ready_minutes", 12);
        return result;
    }

    @Override
    public Map<String, Object> capturePayment(OrderInput input) {
        String orderId = input.getOrderId();
        backend.emitEvent(orderId, "capture_payment", "running");

        sleep(300);

        backend.emitEvent(orderId, "capture_payment", "completed",
                String.format("Payment captured: $%.2f", input.getTotal()));

        Map<String, Object> result = new HashMap<>();
        result.put("authorization_id", input.getAuthorizationId());
        result.put("amount", input.getTotal());
        result.put("status", "captured");
        return result;
    }

    @Override
    public Map<String, Object> releasePaymentHold(OrderInput input) {
        String orderId = input.getOrderId();
        String authId = input.getAuthorizationId();

        if (authId == null || authId.isEmpty()) {
            Map<String, Object> result = new HashMap<>();
            result.put("status", "no_hold");
            return result;
        }

        backend.emitEvent(orderId, "release_payment_hold", "running");

        sleep(300);

        backend.emitEvent(orderId, "release_payment_hold", "completed",
                String.format("Payment hold released: $%.2f (compensation)", input.getTotal()));

        Map<String, Object> result = new HashMap<>();
        result.put("authorization_id", authId);
        result.put("amount", input.getTotal());
        result.put("status", "released");
        return result;
    }

    @Override
    public Map<String, Object> notifyCustomer(OrderInput input) {
        String orderId = input.getOrderId();

        sleep(200);

        boolean success = input.getSuccess() == null || input.getSuccess();

        if (success) {
            backend.emitEvent(orderId, "notify_customer_success", "completed",
                    "Customer notified: Your order is ready for pickup!");
        } else {
            backend.emitEvent(orderId, "notify_customer_failure", "completed",
                    "Customer notified: Sorry, we couldn't process your order. "
                            + "Your payment hold has been released.");
        }

        Map<String, Object> result = new HashMap<>();
        result.put("notified", true);
        result.put("success", success);
        return result;
    }

    // --- Helpers ---

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static double toDouble(Object value) {
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        return 0.0;
    }
}
