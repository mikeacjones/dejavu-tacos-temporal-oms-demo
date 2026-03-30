from __future__ import annotations

import asyncio

from dejavu_tacos.config import should_fail


class CartError(Exception):
    pass


async def validate_order(items: list[dict]) -> dict:
    """Validate that all order items are valid and prices are correct."""
    await asyncio.sleep(0.2)
    if should_fail("validate_order"):
        raise CartError("Order validation failed — invalid items")
    total = sum(item.get("price", 0) * item.get("quantity", 1) for item in items)
    return {"valid": True, "item_count": len(items), "total": round(total, 2)}


async def clear_cart(order_id: str) -> dict:
    """Clear the customer's cart after order is committed."""
    await asyncio.sleep(0.1)
    return {"cleared": True, "order_id": order_id}
