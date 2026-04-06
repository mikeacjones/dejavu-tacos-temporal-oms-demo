import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  log,
  CancellationScope,
} from "@temporalio/workflow";

import type { Activities, OrderInput } from "./activities";

const TASK_QUEUE = "dejavu-tacos";

const acts = proxyActivities<Activities>({
  startToCloseTimeout: "10 seconds",
  retry: { maximumAttempts: 3 },
});

const submitActs = proxyActivities<Activities>({
  startToCloseTimeout: "10 seconds",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 1.5,
    maximumInterval: "8 seconds",
    maximumAttempts: 10,
  },
});

const compensationActs = proxyActivities<Activities>({
  startToCloseTimeout: "10 seconds",
  retry: { maximumAttempts: 5 },
});

const notifyActs = proxyActivities<Activities>({
  startToCloseTimeout: "10 seconds",
});

export const orderReadySignal = defineSignal("order_ready");
export const getStatusQuery = defineQuery<string>("get_status");

export { TASK_QUEUE };

export async function OrderWorkflow(
  orderInput: OrderInput
): Promise<Record<string, unknown>> {
  const orderID = orderInput.order_id;
  let authorizationID = "";
  let orderReady = false;
  let status = "pending";

  setHandler(orderReadySignal, () => {
    orderReady = true;
  });

  setHandler(getStatusQuery, () => status);

  // Compensation stack (saga pattern): register compensation BEFORE
  // executing the step, because the step may succeed but the activity
  // could still fail (timeout, etc.) after the side-effect occurred.
  const compensations: Array<() => Promise<unknown>> = [];

  try {
    // Step 1: Validate Order
    status = "validating_order";
    await acts.validateOrder(orderInput);

    // Step 2: Validate Store
    status = "validating_store";
    await acts.validateStore(orderInput);

    // Step 3: Authorize Payment (hold, not capture)
    status = "authorizing_payment";
    compensations.push(() =>
      compensationActs.releasePaymentHold({
        ...orderInput,
        authorization_id: authorizationID,
      })
    );
    const paymentResult = await acts.authorizePayment(orderInput);
    authorizationID = paymentResult.authorization_id;

    // Step 4: Clear Cart
    status = "clearing_cart";
    await acts.clearCart(orderInput);

    // Step 5: Submit to Store
    status = "submitting_to_store";
    await submitActs.submitToStore(orderInput);

    // Step 6: Wait for order ready signal (human in the loop)
    status = "preparing";
    await condition(() => orderReady);

    // Step 7: Capture Payment (only after store confirms)
    status = "capturing_payment";
    await acts.capturePayment({
      ...orderInput,
      authorization_id: authorizationID,
    });

    // Notify customer of success
    status = "completed";
    await notifyActs.notifyCustomer({ ...orderInput, success: true });

    return { success: true, order_id: orderID };
  } catch (err) {
    log.error("Order failed", { orderID, error: String(err) });
    status = "compensating";

    // Run compensations in reverse order (saga pattern)
    // nonCancellable ensures compensations run even if workflow is cancelled
    await CancellationScope.nonCancellable(async () => {
      for (const comp of [...compensations].reverse()) {
        try {
          await comp();
        } catch (compErr) {
          log.error("Compensation failed", { error: String(compErr) });
        }
      }
    });

    // Notify customer of failure
    status = "failed";
    await CancellationScope.nonCancellable(async () => {
      await notifyActs.notifyCustomer({ ...orderInput, success: false });
    });

    return { success: false, error: String(err), order_id: orderID };
  }
}
