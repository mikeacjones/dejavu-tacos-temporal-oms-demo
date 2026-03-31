from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class ArchitectureMode(str, Enum):
    TRADITIONAL = "traditional"
    TEMPORAL = "temporal"


class FailureScenario(str, Enum):
    NONE = "none"
    STORE_CONNECTIVITY = "store_connectivity"
    PAYMENT_ERROR = "payment_error"
    RANDOM_CHAOS = "random_chaos"


class PresentationMode(str, Enum):
    SIMPLE = "simple"
    DETAILED = "detailed"


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"


class Settings(BaseModel):
    mode: ArchitectureMode = ArchitectureMode.TEMPORAL
    failure_scenario: FailureScenario = FailureScenario.STORE_CONNECTIVITY
    presentation_mode: PresentationMode = PresentationMode.DETAILED


class MenuItem(BaseModel):
    id: str
    name: str
    description: str
    price: float
    image: str = ""
    category: str


class OrderItem(BaseModel):
    menu_item_id: str
    name: str
    quantity: int
    price: float


class CreateOrderRequest(BaseModel):
    items: list[OrderItem]


class Order(BaseModel):
    order_id: str
    items: list[OrderItem]
    total: float
    status: str = "pending"
    created_at: datetime = Field(default_factory=datetime.now)


class OrderEvent(BaseModel):
    order_id: str
    step: str
    status: StepStatus
    attempt: int = 1
    max_attempts: int = 1
    error: str | None = None
    detail: str = ""
    timestamp: datetime = Field(default_factory=datetime.now)
    mode: ArchitectureMode = ArchitectureMode.TRADITIONAL
