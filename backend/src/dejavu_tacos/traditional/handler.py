from __future__ import annotations

from dejavu_tacos.api.events import emit_event
from dejavu_tacos.models import ArchitectureMode, Order, StepStatus
from dejavu_tacos.services.cart import clear_cart, validate_order
from dejavu_tacos.services.payment import authorize_payment
from dejavu_tacos.services.store import submit_to_store, validate_store

MODE = ArchitectureMode.TRADITIONAL


async def process_order_traditional(order: Order) -> dict:
    """
    Process an order with direct sequential service calls.

    No retries. No compensation. When something fails, the chain stops
    and any prior side effects (like a payment hold) are left dangling.
    This is the "bad example" that contrasts with the Temporal workflow.
    """
    order_id = order.order_id
    items = [item.model_dump() for item in order.items]
    authorization_id: str | None = None

    # Step 1: Validate Order
    await emit_event(order_id, "validate_order", StepStatus.RUNNING, mode=MODE)
    try:
        result = await validate_order(items)
        await emit_event(
            order_id,
            "validate_order",
            StepStatus.COMPLETED,
            mode=MODE,
            detail=f"Validated {result['item_count']} items, total ${result['total']:.2f}",
        )
    except Exception as e:
        await emit_event(
            order_id, "validate_order", StepStatus.FAILED, mode=MODE, error=str(e)
        )
        return {"success": False, "error": str(e), "failed_step": "validate_order"}

    # Step 2: Validate Store
    await emit_event(order_id, "validate_store", StepStatus.RUNNING, mode=MODE)
    try:
        store_info = await validate_store()
        await emit_event(
            order_id,
            "validate_store",
            StepStatus.COMPLETED,
            mode=MODE,
            detail=f"{store_info['name']} is open, ~{store_info['estimated_wait_minutes']} min wait",
        )
    except Exception as e:
        await emit_event(
            order_id, "validate_store", StepStatus.FAILED, mode=MODE, error=str(e)
        )
        return {"success": False, "error": str(e), "failed_step": "validate_store"}

    # Step 3: Authorize Payment
    await emit_event(order_id, "authorize_payment", StepStatus.RUNNING, mode=MODE)
    try:
        payment = await authorize_payment(order_id, order.total)
        authorization_id = payment.authorization_id
        await emit_event(
            order_id,
            "authorize_payment",
            StepStatus.COMPLETED,
            mode=MODE,
            detail=f"Hold placed: ${payment.amount:.2f} (auth: {authorization_id})",
        )
    except Exception as e:
        await emit_event(
            order_id, "authorize_payment", StepStatus.FAILED, mode=MODE, error=str(e)
        )
        return {"success": False, "error": str(e), "failed_step": "authorize_payment"}

    # Step 4: Clear Cart
    await emit_event(order_id, "clear_cart", StepStatus.RUNNING, mode=MODE)
    try:
        await clear_cart(order_id)
        await emit_event(
            order_id, "clear_cart", StepStatus.COMPLETED, mode=MODE, detail="Cart cleared"
        )
    except Exception as e:
        await emit_event(
            order_id, "clear_cart", StepStatus.FAILED, mode=MODE, error=str(e)
        )
        return {"success": False, "error": str(e), "failed_step": "clear_cart"}

    # Step 5: Submit to Store — THIS IS WHERE IT BREAKS
    # Note: payment hold is already placed. If this fails, the customer
    # has been charged but the store never gets the order. No compensation.
    await emit_event(order_id, "submit_to_store", StepStatus.RUNNING, mode=MODE)
    try:
        store_result = await submit_to_store(order_id, items)
        await emit_event(
            order_id,
            "submit_to_store",
            StepStatus.COMPLETED,
            mode=MODE,
            detail=f"Store accepted, ready in ~{store_result['estimated_ready_minutes']} min",
        )
    except Exception as e:
        await emit_event(
            order_id,
            "submit_to_store",
            StepStatus.FAILED,
            mode=MODE,
            error=str(e),
            detail=f"CRITICAL: Payment hold of ${order.total:.2f} (auth: {authorization_id}) "
            "was placed but the store never received the order. "
            "No automatic recovery. Customer support ticket required.",
        )
        return {"success": False, "error": str(e), "failed_step": "submit_to_store"}

    return {"success": True, "order_id": order_id}
