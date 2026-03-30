from __future__ import annotations

import asyncio
import random

from dejavu_tacos.models import FailureScenario, MenuItem, Settings

# ---------------------------------------------------------------------------
# Global mutable state (in-memory, no database)
# ---------------------------------------------------------------------------

settings = Settings()

# Store connectivity — toggled from KDS "Plug It Back In" button
# Starts offline when default failure scenario is store_connectivity
store_online: bool = False

# In-memory order storage (customer-side — created when order is placed)
orders: dict[str, dict] = {}

# Store-side orders — only populated when submit_to_store succeeds
# This is what the KDS actually sees
store_orders: dict[str, dict] = {}

# SSE event queues: order_id -> asyncio.Queue
event_queues: dict[str, asyncio.Queue] = {}


def should_fail(step: str) -> bool:
    """Check whether a step should fail based on the active failure scenario."""
    if settings.failure_scenario == FailureScenario.NONE:
        return False
    if settings.failure_scenario == FailureScenario.STORE_CONNECTIVITY:
        return step in ("submit_to_store", "validate_store_submit") and not store_online
    if settings.failure_scenario == FailureScenario.PAYMENT_ERROR:
        return step == "authorize_payment"
    if settings.failure_scenario == FailureScenario.RANDOM_CHAOS:
        return random.random() < 0.3
    return False


def reset_state() -> None:
    """Reset all in-memory state for a fresh demo run."""
    global store_online
    settings.mode = settings.mode  # keep current mode
    # For store_connectivity scenario, store starts offline so the demo failure triggers
    store_online = settings.failure_scenario != FailureScenario.STORE_CONNECTIVITY
    orders.clear()
    store_orders.clear()
    # Drain and clear event queues
    for q in event_queues.values():
        while not q.empty():
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                break
    event_queues.clear()


# ---------------------------------------------------------------------------
# Static menu data
# ---------------------------------------------------------------------------

MENU_ITEMS: list[MenuItem] = [
    MenuItem(
        id="crunch-wrap",
        name="Déjà Vu Crunch Wrap",
        description="A crunchy, cheesy wrap you swear you've had before.",
        price=5.49,
        image="🌯",
        category="Wraps",
    ),
    MenuItem(
        id="taco-supreme",
        name="Temporal Taco Supreme",
        description="Seasoned beef, lettuce, tomato, sour cream — timeless.",
        price=3.99,
        image="🌮",
        category="Tacos",
    ),
    MenuItem(
        id="saga-nachos",
        name="Saga Nachos Bell Grande",
        description="Layers of chips, cheese, beans, and beef. An epic saga in every bite.",
        price=4.79,
        image="🧀",
        category="Sides",
    ),
    MenuItem(
        id="burrito",
        name="Eventual Consistency Burrito",
        description="Everything comes together… eventually.",
        price=6.49,
        image="🌯",
        category="Burritos",
    ),
    MenuItem(
        id="quesadilla",
        name="Idempotent Quesadilla",
        description="Order it twice, get the same delicious result.",
        price=4.99,
        image="🫓",
        category="Specialties",
    ),
    MenuItem(
        id="cinnamon-twists",
        name="Retry Cinnamon Twists",
        description="So good you'll keep coming back.",
        price=1.99,
        image="🍩",
        category="Sweets",
    ),
    MenuItem(
        id="churro",
        name="Compensating Churro",
        description="When things go wrong, this makes it right.",
        price=2.49,
        image="🥖",
        category="Sweets",
    ),
    MenuItem(
        id="baja-blast",
        name="Baja Blast (Durable)",
        description="Refreshingly persistent.",
        price=2.29,
        image="🥤",
        category="Drinks",
    ),
]
