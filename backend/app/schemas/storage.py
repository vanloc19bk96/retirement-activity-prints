from pydantic import BaseModel, Field


class UploadImageResponse(BaseModel):
    bucket: str
    path: str
    public_url: str = Field(alias="publicUrl")

