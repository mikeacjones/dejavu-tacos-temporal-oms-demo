from __future__ import annotations

import asyncio
import json
from datetime import datetime

from dejavu_tacos import config
from dejavu_tacos.models import ArchitectureMode, OrderEvent, StepStatus


async def emit_event(
    order_id: str,
    step: str,
    status: StepStatus,
    *,
    mode: ArchitectureMode = ArchitectureMode.TRADITIONAL,
    attempt: int = 1,
    max_attempts: int = 1,
    error: str | None = None,
    detail: str = "",
) -> None:
    """Push an order event into the SSE queue for the given order."""
    queue = config.event_queues.get(order_id)
    if queue is None:
        return

    event = OrderEvent(
        order_id=order_id,
        step=step,
        status=status,
        attempt=attempt,
        max_attempts=max_attempts,
        error=error,
        detail=detail,
        timestamp=datetime.now(),
        mode=mode,
    )
    await queue.put(event.model_dump(mode="json"))


async def event_generator(order_id: str):
    """Async generator yielding SSE events for a given order."""
    queue = config.event_queues.get(order_id)
    if queue is None:
        return

    while True:
        try:
            event = await asyncio.wait_for(queue.get(), timeout=300)
            yield {"event": "order_update", "data": json.dumps(event)}

            # Terminal conditions
            status = event.get("status")
            step = event.get("step")
            mode = event.get("mode")

            # Traditional mode: stop on any failure
            if status == "failed" and mode == "traditional":
                yield {
                    "event": "order_complete",
                    "data": json.dumps({"final_status": "failed"}),
                }
                return

            # Order fully complete — payment captured means success
            if status == "completed" and step == "capture_payment":
                yield {
                    "event": "order_complete",
                    "data": json.dumps({"final_status": "completed"}),
                }
                return

            # Success notification (after capture_payment)
            if status == "completed" and step == "notify_customer_success":
                yield {
                    "event": "order_complete",
                    "data": json.dumps({"final_status": "completed"}),
                }
                return

            # Compensation completed — payment hold released
            if status == "completed" and step == "release_payment_hold":
                yield {
                    "event": "order_complete",
                    "data": json.dumps({"final_status": "refunded"}),
                }
                return

            # Failure notification (order couldn't be processed)
            if status == "completed" and step == "notify_customer_failure":
                yield {
                    "event": "order_complete",
                    "data": json.dumps({"final_status": "failed"}),
                }
                return

        except asyncio.TimeoutError:
            yield {"event": "timeout", "data": json.dumps({"timeout": True})}
            return
