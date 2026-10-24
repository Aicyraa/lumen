from typing import Literal

from pydantic import BaseModel, Field


class ModelSpec(BaseModel):
    provider: Literal["openai", "anthropic", "google", "openai_compatible"]
    model_id: str = Field(min_length=1)
    endpoint_url: str = Field(min_length=1)
    api_key: str = Field(min_length=1)
    tenant_model_id: str | None = None


class TenantModels(BaseModel):
    cheap: list[ModelSpec] = []
    expensive: list[ModelSpec] = []


class QueryRequest(BaseModel):
    tenant_id: str = Field(min_length=1)
    query: str = Field(
        min_length=1
    )  # the upper length limit is enforced by Express (400/422 there)
    session_id: str | None = None  # accepted for the contract; Express stores it in request_logs
    models: TenantModels | None = (
        None  # absent: use the dev/test default from the LLM_* environment
    )
    force_tier: Literal["cheap", "expensive"] | None = (
        None  # internal only (Express never sends it): replaces the router tier choice
    )
    include_snippets: bool = False  # Try it only: adds filename and snippet to each source
