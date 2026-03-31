from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from uuid import uuid4

import aiohttp

from dejavu_tacos.config import should_fail

_BACKEND_URL = os.environ.get("DEJAVU_BACKEND_URL", "")


class PaymentError(Exception):
    pass


@dataclass
class PaymentResult:
    authorization_id: str
    amount: float
    status: str  # "authorized" | "captured" | "released"


async def _check_should_fail(step: str) -> bool:
    if _BACKEND_URL:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{_BACKEND_URL}/api/internal/should-fail/{step}") as resp:
                    data = await resp.json()
                    return data.get("should_fail", False)
        except Exception:
            return False
    return should_fail(step)


async def authorize_payment(order_id: str, amount: float) -> PaymentResult:
    """Place a hold on the customer's payment method."""
    await asyncio.sleep(0.5)
    if await _check_should_fail("authorize_payment"):
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
