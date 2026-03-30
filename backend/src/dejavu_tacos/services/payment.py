from __future__ import annotations

import asyncio
from dataclasses import dataclass
from uuid import uuid4

from dejavu_tacos.config import should_fail


class PaymentError(Exception):
    pass


@dataclass
class PaymentResult:
    authorization_id: str
    amount: float
    status: str  # "authorized" | "captured" | "released"


async def authorize_payment(order_id: str, amount: float) -> PaymentResult:
    """Place a hold on the customer's payment method."""
    await asyncio.sleep(0.5)
    if should_fail("authorize_payment"):
        raise PaymentError("Payment gateway timeout — connection refused")
    return PaymentResult(
        authorization_id=f"auth_{uuid4().hex[:8]}",
        amount=amount,
        status="authorized",
    )


async def capture_payment(authorization_id: str, amount: float) -> PaymentResult:
    """Capture a previously authorized payment hold."""
    await asyncio.sleep(0.3)
    return PaymentResult(
        authorization_id=authorization_id,
        amount=amount,
        status="captured",
    )


async def release_payment_hold(authorization_id: str, amount: float) -> PaymentResult:
    """Release/void a payment hold (compensation)."""
    await asyncio.sleep(0.3)
    return PaymentResult(
        authorization_id=authorization_id,
        amount=amount,
        status="released",
    )
