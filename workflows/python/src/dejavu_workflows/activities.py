from __future__ import annotations

import asyncio

from temporalio import activity

from dejavu_tacos.api.events import emit_event
from dejavu_tacos.models import ArchitectureMode, StepStatus
from dejavu_tacos.services.cart import clear_cart, validate_order
from dejavu_tacos.services.payment import (
    authorize_payment,
    capture_payment,
    release_payment_hold,
)
from dejavu_tacos.services.store import submit_to_store, validate_store

MODE = ArchitectureMode.TEMPORAL


@activity.defn
async def validate_order_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    await emit_event(order_id, "validate_order", StepStatus.RUNNING, mode=MODE)
    try:
        result = await validate_order(order_input["items"])
        await emit_event(
            order_id,
            "validate_order",
            StepStatus.COMPLETED,
            mode=MODE,
            detail=f"Validated {result['item_count']} items, total ${result['total']:.2f}",
        )
        return result
    except Exception as e:
        info = activity.info()
        await emit_event(
            order_id,
            "validate_order",
            StepStatus.RETRYING,
            mode=MODE,
            attempt=info.attempt,
            error=str(e),
        )
        raise


@activity.defn
async def validate_store_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    await emit_event(order_id, "validate_store", StepStatus.RUNNING, mode=MODE)
    try:
        result = await validate_store()
        await emit_event(
            order_id,
            "validate_store",
            StepStatus.COMPLETED,
            mode=MODE,
            detail=f"{result['name']} is open, ~{result['estimated_wait_minutes']} min wait",
        )
        return result
    except Exception as e:
        info = activity.info()
        await emit_event(
            order_id,
            "validate_store",
            StepStatus.RETRYING,
            mode=MODE,
            attempt=info.attempt,
            error=str(e),
        )
        raise


@activity.defn
async def authorize_payment_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    amount = order_input["total"]
    await emit_event(order_id, "authorize_payment", StepStatus.RUNNING, mode=MODE)
    try:
        result = await authorize_payment(order_id, amount)
        await emit_event(
            order_id,
            "authorize_payment",
            StepStatus.COMPLETED,
            mode=MODE,
            detail=f"Hold placed: ${result.amount:.2f} (auth: {result.authorization_id})",
        )
        return {
            "authorization_id": result.authorization_id,
            "amount": result.amount,
            "status": result.status,
        }
    except Exception as e:
        info = activity.info()
        await emit_event(
            order_id,
            "authorize_payment",
            StepStatus.RETRYING,
            mode=MODE,
            attempt=info.attempt,
            error=str(e),
        )
        raise


@activity.defn
async def clear_cart_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    await emit_event(order_id, "clear_cart", StepStatus.RUNNING, mode=MODE)
    result = await clear_cart(order_id)
    await emit_event(
        order_id,
        "clear_cart",
        StepStatus.COMPLETED,
        mode=MODE,
        detail="Cart cleared",
    )
    return result


@activity.defn
async def submit_to_store_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    info = activity.info()
    await emit_event(
        order_id,
        "submit_to_store",
        StepStatus.RUNNING,
        mode=MODE,
        attempt=info.attempt,
        max_attempts=10,
    )
    try:
        result = await submit_to_store(order_id, order_input["items"])
        await emit_event(
            order_id,
            "submit_to_store",
            StepStatus.COMPLETED,
            mode=MODE,
            attempt=info.attempt,
            max_attempts=10,
            detail=f"Store accepted, ready in ~{result['estimated_ready_minutes']} min",
        )
        return result
    except Exception as e:
        await emit_event(
            order_id,
            "submit_to_store",
            StepStatus.RETRYING,
            mode=MODE,
            attempt=info.attempt,
            max_attempts=10,
            error=str(e),
        )
        raise


@activity.defn
async def capture_payment_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    authorization_id = order_input["authorization_id"]
    amount = order_input["total"]
    await emit_event(order_id, "capture_payment", StepStatus.RUNNING, mode=MODE)
    result = await capture_payment(authorization_id, amount)
    await emit_event(
        order_id,
        "capture_payment",
        StepStatus.COMPLETED,
        mode=MODE,
        detail=f"Payment captured: ${result.amount:.2f}",
    )
    return {
        "authorization_id": result.authorization_id,
        "amount": result.amount,
        "status": result.status,
    }


@activity.defn
async def release_payment_hold_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    authorization_id = order_input["authorization_id"]
    amount = order_input["total"]
    await emit_event(
        order_id, "release_payment_hold", StepStatus.RUNNING, mode=MODE
    )
    result = await release_payment_hold(authorization_id, amount)
    await emit_event(
        order_id,
        "release_payment_hold",
        StepStatus.COMPLETED,
        mode=MODE,
        detail=f"Payment hold released: ${result.amount:.2f} (compensation)",
    )
    return {
        "authorization_id": result.authorization_id,
        "amount": result.amount,
        "status": result.status,
    }


@activity.defn
async def notify_customer_activity(order_input: dict) -> dict:
    order_id = order_input["order_id"]
    success = order_input.get("success", True)
    await asyncio.sleep(0.2)
    if success:
        await emit_event(
            order_id,
            "notify_customer_success",
            StepStatus.COMPLETED,
            mode=MODE,
            detail="Customer notified: Your order is ready for pickup!",
        )
    else:
        await emit_event(
            order_id,
            "notify_customer_failure",
            StepStatus.COMPLETED,
            mode=MODE,
            detail="Customer notified: Sorry, we couldn't process your order. "
            "Your payment hold has been released.",
        )
    return {"notified": True, "success": success}
