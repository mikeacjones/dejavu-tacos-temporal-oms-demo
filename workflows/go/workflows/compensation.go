package workflows

import (
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
	"time"
)

// Compensations collects compensation functions and executes them in reverse
// order using a disconnected context. This matches the pattern from
// github.com/temporalio/temporal-compensating-transactions.
type Compensations struct {
	comps []func(ctx workflow.Context) error
}

// AddCompensation registers a compensation to run on failure.
// Register BEFORE executing the activity — the effect may succeed
// even if the activity call fails (timeout, network error, etc).
func (c *Compensations) AddCompensation(activity interface{}, args ...interface{}) {
	c.comps = append(c.comps, func(ctx workflow.Context) error {
		return workflow.ExecuteActivity(ctx, activity, args...).Get(ctx, nil)
	})
}

// Compensate runs all registered compensations in reverse order.
// Uses a disconnected context so compensations execute even if
// the workflow is cancelled.
func (c *Compensations) Compensate(ctx workflow.Context) {
	disconnectedCtx, _ := workflow.NewDisconnectedContext(ctx)
	compCtx := workflow.WithActivityOptions(disconnectedCtx, workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 5,
		},
	})

	logger := workflow.GetLogger(ctx)
	for i := len(c.comps) - 1; i >= 0; i-- {
		if err := c.comps[i](compCtx); err != nil {
			logger.Error("Compensation failed", "error", err)
		}
	}
}
