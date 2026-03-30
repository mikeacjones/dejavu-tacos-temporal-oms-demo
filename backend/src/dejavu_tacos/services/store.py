from __future__ import annotations

import asyncio

from dejavu_tacos import config
from dejavu_tacos.config import should_fail


class StoreError(Exception):
    pass


async def validate_store(store_id: str = "store-001") -> dict:
    """Check that the store is open and accepting orders."""
    await asyncio.sleep(0.3)
    if should_fail("validate_store"):
        raise StoreError("Unable to reach store — connection refused")
    return {
        "store_id": store_id,
        "open": True,
        "name": "Déjà Vu Tacos #42",
        "estimated_wait_minutes": 12,
    }


async def submit_to_store(order_id: str, items: list[dict]) -> dict:
    """Submit the order to the store's kitchen system."""
    await asyncio.sleep(0.5)
    if should_fail("submit_to_store"):
        raise StoreError(
            "Store connectivity lost — Bob accidentally unplugged the ethernet"
        )

    # Order successfully received by store — add to KDS
    order_data = config.orders.get(order_id, {})
    config.store_orders[order_id] = {
        "order_id": order_id,
        "items": items if items else order_data.get("items", []),
        "total": order_data.get("total", 0),
        "status": "preparing",
        "created_at": order_data.get("created_at", ""),
    }

    return {
        "accepted": True,
        "order_id": order_id,
        "estimated_ready_minutes": 12,
    }
