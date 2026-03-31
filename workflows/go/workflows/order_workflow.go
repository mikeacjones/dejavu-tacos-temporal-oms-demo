package workflows

import (
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"github.com/mikeacjones/dejavu-tacos-temporal-oms-demo/workflows/go/activities"
)

const TaskQueue = "dejavu-tacos"

// OrderWorkflow orchestrates the order processing pipeline.
// Registered as "OrderWorkflow" to match the Python backend's string-based start.
func OrderWorkflow(ctx workflow.Context, orderInput map[string]interface{}) (map[string]interface{}, error) {
	logger := workflow.GetLogger(ctx)

	orderID, _ := orderInput["order_id"].(string)

	// Build typed input from the generic map
	input := activities.OrderInput{
		OrderID: orderID,
		Total:   orderInput["total"].(float64),
	}
	if items, ok := orderInput["items"].([]interface{}); ok {
		for _, item := range items {
			if m, ok := item.(map[string]interface{}); ok {
				input.Items = append(input.Items, m)
			}
		}
	}

	// Default activity options
	defaultCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	})

	// Signal channel for order_ready (human in the loop)
	orderReady := false
	orderReadyCh := workflow.GetSignalChannel(ctx, "order_ready")
	workflow.Go(ctx, func(gCtx workflow.Context) {
		orderReadyCh.Receive(gCtx, nil)
		orderReady = true
	})

	// Query handler for status
	status := "pending"
	_ = workflow.SetQueryHandler(ctx, "get_status", func() (string, error) {
		return status, nil
	})

	// Saga compensation stack — register before each side-effecting step
	type compensation struct {
		name string
		fn   func(workflow.Context) error
	}
	var compensations []compensation

	runCompensations := func() {
		disconnectedCtx, _ := workflow.NewDisconnectedContext(ctx)
		compCtx := workflow.WithActivityOptions(disconnectedCtx, workflow.ActivityOptions{
			StartToCloseTimeout: 10 * time.Second,
			RetryPolicy: &temporal.RetryPolicy{
				MaximumAttempts: 5,
			},
		})
		for i := len(compensations) - 1; i >= 0; i-- {
			c := compensations[i]
			if err := c.fn(compCtx); err != nil {
				logger.Error("Compensation failed", "name", c.name, "error", err)
			}
		}
	}

	var authorizationID string

	// Step 1: Validate Order
	status = "validating_order"
	if err := workflow.ExecuteActivity(defaultCtx, "ValidateOrder", input).Get(ctx, nil); err != nil {
		status = "failed"
		return map[string]interface{}{"success": false, "error": err.Error(), "order_id": orderID}, nil
	}

	// Step 2: Validate Store
	status = "validating_store"
	if err := workflow.ExecuteActivity(defaultCtx, "ValidateStore", input).Get(ctx, nil); err != nil {
		status = "failed"
		return map[string]interface{}{"success": false, "error": err.Error(), "order_id": orderID}, nil
	}

	// Step 3: Authorize Payment — register compensation BEFORE executing
	status = "authorizing_payment"
	compensations = append(compensations, compensation{
		name: "release_payment",
		fn: func(compCtx workflow.Context) error {
			compInput := input
			compInput.AuthorizationID = authorizationID
			return workflow.ExecuteActivity(compCtx, "ReleasePaymentHold", compInput).Get(compCtx, nil)
		},
	})

	var paymentResult map[string]interface{}
	if err := workflow.ExecuteActivity(defaultCtx, "AuthorizePayment", input).Get(ctx, &paymentResult); err != nil {
		logger.Error("Payment authorization failed", "error", err)
		runCompensations()
		status = "failed"
		notifyFailure(ctx, input)
		return map[string]interface{}{"success": false, "error": err.Error(), "order_id": orderID}, nil
	}
	authorizationID, _ = paymentResult["authorization_id"].(string)

	// Step 4: Clear Cart
	status = "clearing_cart"
	if err := workflow.ExecuteActivity(defaultCtx, "ClearCart", input).Get(ctx, nil); err != nil {
		runCompensations()
		status = "failed"
		notifyFailure(ctx, input)
		return map[string]interface{}{"success": false, "error": err.Error(), "order_id": orderID}, nil
	}

	// Step 5: Submit to Store — generous retry policy
	status = "submitting_to_store"
	submitCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    2 * time.Second,
			BackoffCoefficient: 1.5,
			MaximumInterval:    8 * time.Second,
			MaximumAttempts:    10,
		},
	})
	if err := workflow.ExecuteActivity(submitCtx, "SubmitToStore", input).Get(ctx, nil); err != nil {
		logger.Error("Store submission failed permanently", "error", err)
		runCompensations()
		status = "failed"
		notifyFailure(ctx, input)
		return map[string]interface{}{"success": false, "error": err.Error(), "order_id": orderID}, nil
	}

	// Step 6: Wait for order ready signal (human in the loop)
	status = "preparing"
	if err := workflow.Await(ctx, func() bool { return orderReady }); err != nil {
		runCompensations()
		status = "failed"
		return map[string]interface{}{"success": false, "error": err.Error(), "order_id": orderID}, nil
	}

	// Step 7: Capture Payment
	status = "capturing_payment"
	captureInput := input
	captureInput.AuthorizationID = authorizationID
	if err := workflow.ExecuteActivity(defaultCtx, "CapturePayment", captureInput).Get(ctx, nil); err != nil {
		runCompensations()
		status = "failed"
		notifyFailure(ctx, input)
		return map[string]interface{}{"success": false, "error": err.Error(), "order_id": orderID}, nil
	}

	// Notify customer of success
	status = "completed"
	notifySuccess(ctx, input)

	return map[string]interface{}{"success": true, "order_id": orderID}, nil
}

func notifySuccess(ctx workflow.Context, input activities.OrderInput) {
	successCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Second,
	})
	b := true
	input.Success = &b
	_ = workflow.ExecuteActivity(successCtx, "NotifyCustomer", input).Get(ctx, nil)
}

func notifyFailure(ctx workflow.Context, input activities.OrderInput) {
	disconnectedCtx, _ := workflow.NewDisconnectedContext(ctx)
	failCtx := workflow.WithActivityOptions(disconnectedCtx, workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Second,
	})
	b := false
	input.Success = &b
	_ = workflow.ExecuteActivity(failCtx, "NotifyCustomer", input).Get(failCtx, nil)
}
