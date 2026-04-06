package dejavu;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

/**
 * HTTP client for communicating with the FastAPI backend's internal API.
 * Handles failure-state checks, SSE event push, and store order registration.
 */
public class BackendClient {

    private final String baseUrl;
    private final HttpClient httpClient;
    private final Gson gson;

    public BackendClient(String baseUrl) {
        this.baseUrl = baseUrl;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        this.gson = new Gson();
    }

    /**
     * Check whether a step should fail based on the backend's current failure scenario.
     */
    public boolean shouldFail(String step) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/api/internal/should-fail/" + step))
                    .timeout(Duration.ofSeconds(5))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            JsonObject result = gson.fromJson(response.body(), JsonObject.class);
            return result.has("should_fail") && result.get("should_fail").getAsBoolean();
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Push an SSE event to the backend for real-time UI updates.
     */
    public void emitEvent(String orderId, String step, String status,
                          int attempt, int maxAttempts, String error, String detail) {
        try {
            Map<String, Object> payload = Map.of(
                    "order_id", orderId,
                    "step", step,
                    "status", status,
                    "attempt", attempt,
                    "max_attempts", maxAttempts,
                    "error", error != null ? error : "",
                    "detail", detail != null ? detail : "",
                    "timestamp", Instant.now().toString(),
                    "mode", "temporal"
            );

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/api/internal/events"))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(payload)))
                    .build();

            httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            // Best effort -- don't fail the activity over an SSE event
        }
    }

    /**
     * Convenience overload: emit with defaults (attempt=1, maxAttempts=1, no error, no detail).
     */
    public void emitEvent(String orderId, String step, String status) {
        emitEvent(orderId, step, status, 1, 1, null, null);
    }

    /**
     * Convenience overload: emit with detail only.
     */
    public void emitEvent(String orderId, String step, String status, String detail) {
        emitEvent(orderId, step, status, 1, 1, null, detail);
    }

    /**
     * Register a store order on the kitchen display system.
     */
    public void registerStoreOrder(String orderId, Map<String, Object> data) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/api/internal/store-orders/" + orderId))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(data)))
                    .build();

            httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            // Best effort
        }
    }
}
