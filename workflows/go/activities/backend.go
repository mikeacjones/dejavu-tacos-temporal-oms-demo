package activities

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// BackendClient communicates with the FastAPI backend's internal API
// for failure state checks, SSE event push, and store order registration.
type BackendClient struct {
	BaseURL    string
	HTTPClient *http.Client
}

func NewBackendClient(baseURL string) *BackendClient {
	return &BackendClient{
		BaseURL: baseURL,
		HTTPClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// ShouldFail checks whether a step should fail based on the backend's current failure scenario.
func (c *BackendClient) ShouldFail(ctx context.Context, step string) bool {
	resp, err := c.HTTPClient.Get(fmt.Sprintf("%s/api/internal/should-fail/%s", c.BaseURL, step))
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	var result struct {
		ShouldFail bool `json:"should_fail"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false
	}
	return result.ShouldFail
}

// EmitEvent pushes an SSE event to the backend for real-time UI updates.
func (c *BackendClient) EmitEvent(ctx context.Context, event OrderEvent) error {
	body, err := json.Marshal(event)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("%s/api/internal/events", c.BaseURL), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil // best effort
	}
	defer resp.Body.Close()
	return nil
}

// RegisterStoreOrder tells the backend that the store has received an order (for KDS display).
func (c *BackendClient) RegisterStoreOrder(ctx context.Context, orderID string, data map[string]interface{}) error {
	body, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("%s/api/internal/store-orders/%s", c.BaseURL, orderID), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil // best effort
	}
	defer resp.Body.Close()
	return nil
}

// OrderEvent matches the Python OrderEvent model.
type OrderEvent struct {
	OrderID     string `json:"order_id"`
	Step        string `json:"step"`
	Status      string `json:"status"`
	Attempt     int    `json:"attempt"`
	MaxAttempts int    `json:"max_attempts"`
	Error       string `json:"error,omitempty"`
	Detail      string `json:"detail"`
	Timestamp   string `json:"timestamp"`
	Mode        string `json:"mode"`
}

func NewEvent(orderID, step, status string) OrderEvent {
	return OrderEvent{
		OrderID:     orderID,
		Step:        step,
		Status:      status,
		Attempt:     1,
		MaxAttempts: 1,
		Timestamp:   time.Now().Format(time.RFC3339),
		Mode:        "temporal",
	}
}
