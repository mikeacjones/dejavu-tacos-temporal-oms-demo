package activities

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/sdk/activity"
)

// OrderInput is the input to all activities.
type OrderInput struct {
	OrderID         string                   `json:"order_id"`
	Items           []map[string]interface{} `json:"items"`
	Total           float64                  `json:"total"`
	AuthorizationID string                   `json:"authorization_id,omitempty"`
	Success         *bool                    `json:"success,omitempty"`
}

// Activities holds dependencies (backend client) injected at worker startup.
type Activities struct {
	Backend *BackendClient
}

func (a *Activities) emit(ctx context.Context, orderID, step, status string, opts ...func(*OrderEvent)) {
	event := NewEvent(orderID, step, status)
	for _, opt := range opts {
		opt(&event)
	}
	_ = a.Backend.EmitEvent(ctx, event)
}

func withDetail(d string) func(*OrderEvent) {
	return func(e *OrderEvent) { e.Detail = d }
}

func withError(err string) func(*OrderEvent) {
	return func(e *OrderEvent) { e.Error = err }
}

func withAttempt(attempt, max int) func(*OrderEvent) {
	return func(e *OrderEvent) {
		e.Attempt = attempt
		e.MaxAttempts = max
	}
}

// ValidateOrder checks that order items are valid.
func (a *Activities) ValidateOrder(ctx context.Context, input OrderInput) (map[string]interface{}, error) {
	a.emit(ctx, input.OrderID, "validate_order", "running")

	time.Sleep(200 * time.Millisecond)
	if a.Backend.ShouldFail(ctx, "validate_order") {
		info := activity.GetInfo(ctx)
		a.emit(ctx, input.OrderID, "validate_order", "retrying", withAttempt(int(info.Attempt), 3), withError("Order validation failed"))
		return nil, fmt.Errorf("order validation failed")
	}

	total := 0.0
	for _, item := range input.Items {
		price, _ := item["price"].(float64)
		qty, _ := item["quantity"].(float64)
		total += price * qty
	}

	a.emit(ctx, input.OrderID, "validate_order", "completed",
		withDetail(fmt.Sprintf("Validated %d items, total $%.2f", len(input.Items), total)))

	return map[string]interface{}{"valid": true, "item_count": len(input.Items), "total": total}, nil
}

// ValidateStore checks that the store is open.
func (a *Activities) ValidateStore(ctx context.Context, input OrderInput) (map[string]interface{}, error) {
	a.emit(ctx, input.OrderID, "validate_store", "running")

	time.Sleep(300 * time.Millisecond)
	if a.Backend.ShouldFail(ctx, "validate_store") {
		info := activity.GetInfo(ctx)
		a.emit(ctx, input.OrderID, "validate_store", "retrying", withAttempt(int(info.Attempt), 3), withError("Unable to reach store"))
		return nil, fmt.Errorf("unable to reach store — connection refused")
	}

	a.emit(ctx, input.OrderID, "validate_store", "completed",
		withDetail("Déjà Vu Tacos #42 is open, ~12 min wait"))

	return map[string]interface{}{"store_id": "store-001", "name": "Déjà Vu Tacos #42", "estimated_wait_minutes": 12}, nil
}

// AuthorizePayment places a hold on the customer's payment.
func (a *Activities) AuthorizePayment(ctx context.Context, input OrderInput) (map[string]interface{}, error) {
	a.emit(ctx, input.OrderID, "authorize_payment", "running")

	time.Sleep(500 * time.Millisecond)
	if a.Backend.ShouldFail(ctx, "authorize_payment") {
		info := activity.GetInfo(ctx)
		a.emit(ctx, input.OrderID, "authorize_payment", "retrying", withAttempt(int(info.Attempt), 3), withError("Payment gateway timeout"))
		return nil, fmt.Errorf("payment gateway timeout — connection refused")
	}

	authID := fmt.Sprintf("auth_%d", time.Now().UnixMilli()%100000000)
	a.emit(ctx, input.OrderID, "authorize_payment", "completed",
		withDetail(fmt.Sprintf("Hold placed: $%.2f (auth: %s)", input.Total, authID)))

	return map[string]interface{}{"authorization_id": authID, "amount": input.Total, "status": "authorized"}, nil
}

// ClearCart marks the cart as cleared.
func (a *Activities) ClearCart(ctx context.Context, input OrderInput) (map[string]interface{}, error) {
	a.emit(ctx, input.OrderID, "clear_cart", "running")
	time.Sleep(100 * time.Millisecond)
	a.emit(ctx, input.OrderID, "clear_cart", "completed", withDetail("Cart cleared"))
	return map[string]interface{}{"cleared": true}, nil
}

// SubmitToStore sends the order to the store's kitchen system.
func (a *Activities) SubmitToStore(ctx context.Context, input OrderInput) (map[string]interface{}, error) {
	info := activity.GetInfo(ctx)
	a.emit(ctx, input.OrderID, "submit_to_store", "running", withAttempt(int(info.Attempt), 10))

	time.Sleep(500 * time.Millisecond)
	if a.Backend.ShouldFail(ctx, "submit_to_store") {
		a.emit(ctx, input.OrderID, "submit_to_store", "retrying",
			withAttempt(int(info.Attempt), 10),
			withError("Store connectivity lost — Bob accidentally unplugged the ethernet"))
		return nil, fmt.Errorf("store connectivity lost — Bob accidentally unplugged the ethernet")
	}

	// Register order on KDS
	_ = a.Backend.RegisterStoreOrder(ctx, input.OrderID, map[string]interface{}{
		"order_id":   input.OrderID,
		"items":      input.Items,
		"total":      input.Total,
		"status":     "preparing",
		"created_at": time.Now().Format(time.RFC3339),
	})

	a.emit(ctx, input.OrderID, "submit_to_store", "completed",
		withAttempt(int(info.Attempt), 10),
		withDetail("Store accepted, ready in ~12 min"))

	return map[string]interface{}{"accepted": true, "estimated_ready_minutes": 12}, nil
}

// CapturePayment captures a previously authorized payment hold.
func (a *Activities) CapturePayment(ctx context.Context, input OrderInput) (map[string]interface{}, error) {
	a.emit(ctx, input.OrderID, "capture_payment", "running")
	time.Sleep(300 * time.Millisecond)
	a.emit(ctx, input.OrderID, "capture_payment", "completed",
		withDetail(fmt.Sprintf("Payment captured: $%.2f", input.Total)))
	return map[string]interface{}{"authorization_id": input.AuthorizationID, "amount": input.Total, "status": "captured"}, nil
}

// ReleasePaymentHold releases a payment hold (compensation).
// Must be idempotent — may be called even if the hold was never placed.
func (a *Activities) ReleasePaymentHold(ctx context.Context, input OrderInput) (map[string]interface{}, error) {
	if input.AuthorizationID == "" {
		// Hold was never placed — nothing to release
		return map[string]interface{}{"status": "no_hold"}, nil
	}
	a.emit(ctx, input.OrderID, "release_payment_hold", "running")
	time.Sleep(300 * time.Millisecond)
	a.emit(ctx, input.OrderID, "release_payment_hold", "completed",
		withDetail(fmt.Sprintf("Payment hold released: $%.2f (compensation)", input.Total)))
	return map[string]interface{}{"authorization_id": input.AuthorizationID, "status": "released"}, nil
}

// NotifyCustomer sends a notification to the customer.
func (a *Activities) NotifyCustomer(ctx context.Context, input OrderInput) (map[string]interface{}, error) {
	time.Sleep(200 * time.Millisecond)

	success := true
	if input.Success != nil {
		success = *input.Success
	}

	if success {
		a.emit(ctx, input.OrderID, "notify_customer_success", "completed",
			withDetail("Customer notified: Your order is ready for pickup!"))
	} else {
		a.emit(ctx, input.OrderID, "notify_customer_failure", "completed",
			withDetail("Customer notified: Sorry, we couldn't process your order. Your payment hold has been released."))
	}

	return map[string]interface{}{"notified": true, "success": success}, nil
}
