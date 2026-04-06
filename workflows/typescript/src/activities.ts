import { Context } from "@temporalio/activity";
import { BackendClient, newEvent } from "./backend-client";

export interface OrderInput {
  order_id: string;
  items: Array<Record<string, unknown>>;
  total: number;
  authorization_id?: string;
  success?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createActivities(backend: BackendClient) {
  function emit(
    orderID: string,
    step: string,
    status: string,
    opts?: {
      detail?: string;
      error?: string;
      attempt?: number;
      maxAttempts?: number;
    }
  ) {
    const event = newEvent(orderID, step, status);
    if (opts?.detail) event.detail = opts.detail;
    if (opts?.error) event.error = opts.error;
    if (opts?.attempt) event.attempt = opts.attempt;
    if (opts?.maxAttempts) event.max_attempts = opts.maxAttempts;
    return backend.emitEvent(event);
  }

  return {
    async validateOrder(
      input: OrderInput
    ): Promise<Record<string, unknown>> {
      await emit(input.order_id, "validate_order", "running");

      await sleep(200);
      if (await backend.shouldFail("validate_order")) {
        const attempt = Context.current().info.attempt;
        await emit(input.order_id, "validate_order", "retrying", {
          attempt,
          maxAttempts: 3,
          error: "Order validation failed",
        });
        throw new Error("order validation failed");
      }

      let total = 0;
      for (const item of input.items) {
        const price = (item.price as number) || 0;
        const qty = (item.quantity as number) || 1;
        total += price * qty;
      }

      await emit(input.order_id, "validate_order", "completed", {
        detail: `Validated ${input.items.length} items, total $${total.toFixed(2)}`,
      });

      return { valid: true, item_count: input.items.length, total };
    },

    async validateStore(
      input: OrderInput
    ): Promise<Record<string, unknown>> {
      await emit(input.order_id, "validate_store", "running");

      await sleep(300);
      if (await backend.shouldFail("validate_store")) {
        const attempt = Context.current().info.attempt;
        await emit(input.order_id, "validate_store", "retrying", {
          attempt,
          maxAttempts: 3,
          error: "Unable to reach store",
        });
        throw new Error("unable to reach store — connection refused");
      }

      await emit(input.order_id, "validate_store", "completed", {
        detail: "Déjà Vu Tacos #42 is open, ~12 min wait",
      });

      return {
        store_id: "store-001",
        name: "Déjà Vu Tacos #42",
        estimated_wait_minutes: 12,
      };
    },

    async authorizePayment(
      input: OrderInput
    ): Promise<{ authorization_id: string; amount: number; status: string }> {
      await emit(input.order_id, "authorize_payment", "running");

      await sleep(500);
      if (await backend.shouldFail("authorize_payment")) {
        const attempt = Context.current().info.attempt;
        await emit(input.order_id, "authorize_payment", "retrying", {
          attempt,
          maxAttempts: 3,
          error: "Payment gateway timeout",
        });
        throw new Error("payment gateway timeout — connection refused");
      }

      const authID = `auth_${Date.now() % 100000000}`;
      await emit(input.order_id, "authorize_payment", "completed", {
        detail: `Hold placed: $${input.total.toFixed(2)} (auth: ${authID})`,
      });

      return {
        authorization_id: authID,
        amount: input.total,
        status: "authorized",
      };
    },

    async clearCart(input: OrderInput): Promise<Record<string, unknown>> {
      await emit(input.order_id, "clear_cart", "running");
      await sleep(100);
      await emit(input.order_id, "clear_cart", "completed", {
        detail: "Cart cleared",
      });
      return { cleared: true };
    },

    async submitToStore(
      input: OrderInput
    ): Promise<Record<string, unknown>> {
      const attempt = Context.current().info.attempt;
      await emit(input.order_id, "submit_to_store", "running", {
        attempt,
        maxAttempts: 10,
      });

      await sleep(500);
      if (await backend.shouldFail("submit_to_store")) {
        await emit(input.order_id, "submit_to_store", "retrying", {
          attempt,
          maxAttempts: 10,
          error:
            "Store connectivity lost — Bob accidentally unplugged the ethernet",
        });
        throw new Error(
          "store connectivity lost — Bob accidentally unplugged the ethernet"
        );
      }

      // Register order on KDS
      await backend.registerStoreOrder(input.order_id, {
        order_id: input.order_id,
        items: input.items,
        total: input.total,
        status: "preparing",
        created_at: new Date().toISOString(),
      });

      await emit(input.order_id, "submit_to_store", "completed", {
        attempt,
        maxAttempts: 10,
        detail: "Store accepted, ready in ~12 min",
      });

      return { accepted: true, estimated_ready_minutes: 12 };
    },

    async capturePayment(
      input: OrderInput
    ): Promise<Record<string, unknown>> {
      await emit(input.order_id, "capture_payment", "running");
      await sleep(300);
      await emit(input.order_id, "capture_payment", "completed", {
        detail: `Payment captured: $${input.total.toFixed(2)}`,
      });
      return {
        authorization_id: input.authorization_id,
        amount: input.total,
        status: "captured",
      };
    },

    async releasePaymentHold(
      input: OrderInput
    ): Promise<Record<string, unknown>> {
      if (!input.authorization_id) {
        return { status: "no_hold" };
      }
      await emit(input.order_id, "release_payment_hold", "running");
      await sleep(300);
      await emit(input.order_id, "release_payment_hold", "completed", {
        detail: `Payment hold released: $${input.total.toFixed(2)} (compensation)`,
      });
      return {
        authorization_id: input.authorization_id,
        status: "released",
      };
    },

    async notifyCustomer(
      input: OrderInput
    ): Promise<Record<string, unknown>> {
      await sleep(200);
      const success = input.success ?? true;

      if (success) {
        await emit(input.order_id, "notify_customer_success", "completed", {
          detail: "Customer notified: Your order is ready for pickup!",
        });
      } else {
        await emit(input.order_id, "notify_customer_failure", "completed", {
          detail:
            "Customer notified: Sorry, we couldn't process your order. Your payment hold has been released.",
        });
      }

      return { notified: true, success };
    },
  };
}

export type Activities = ReturnType<typeof createActivities>;
