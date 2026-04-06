/**
 * HTTP client for communicating with the FastAPI backend's internal API.
 * Mirrors the Go worker's BackendClient — handles SSE event push,
 * failure state checks, and store order registration.
 */

export interface OrderEvent {
  order_id: string;
  step: string;
  status: string;
  attempt: number;
  max_attempts: number;
  error?: string;
  detail: string;
  timestamp: string;
  mode: string;
}

export class BackendClient {
  constructor(private baseURL: string) {}

  async shouldFail(step: string): Promise<boolean> {
    try {
      const resp = await fetch(
        `${this.baseURL}/api/internal/should-fail/${step}`
      );
      const data = (await resp.json()) as { should_fail?: boolean };
      return data.should_fail ?? false;
    } catch {
      return false;
    }
  }

  async emitEvent(event: OrderEvent): Promise<void> {
    try {
      await fetch(`${this.baseURL}/api/internal/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    } catch {
      // Best effort — don't fail the activity over an SSE event
    }
  }

  async registerStoreOrder(
    orderID: string,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      await fetch(
        `${this.baseURL}/api/internal/store-orders/${orderID}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
    } catch {
      // Best effort
    }
  }
}

export function newEvent(
  orderID: string,
  step: string,
  status: string
): OrderEvent {
  return {
    order_id: orderID,
    step,
    status,
    attempt: 1,
    max_attempts: 1,
    detail: "",
    timestamp: new Date().toISOString(),
    mode: "temporal",
  };
}
