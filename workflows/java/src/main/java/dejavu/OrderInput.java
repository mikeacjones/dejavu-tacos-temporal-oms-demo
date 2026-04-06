package dejavu;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

/**
 * POJO representing the order input passed to workflows and activities.
 * Uses Jackson annotations to match the snake_case JSON from the Python backend.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class OrderInput {

    @JsonProperty("order_id")
    private String orderId;

    private List<Map<String, Object>> items;

    private double total;

    @JsonProperty("authorization_id")
    private String authorizationId;

    private Boolean success;

    public OrderInput() {}

    public String getOrderId() {
        return orderId;
    }

    public void setOrderId(String orderId) {
        this.orderId = orderId;
    }

    public List<Map<String, Object>> getItems() {
        return items;
    }

    public void setItems(List<Map<String, Object>> items) {
        this.items = items;
    }

    public double getTotal() {
        return total;
    }

    public void setTotal(double total) {
        this.total = total;
    }

    public String getAuthorizationId() {
        return authorizationId;
    }

    public void setAuthorizationId(String authorizationId) {
        this.authorizationId = authorizationId;
    }

    public Boolean getSuccess() {
        return success;
    }

    public void setSuccess(Boolean success) {
        this.success = success;
    }
}
