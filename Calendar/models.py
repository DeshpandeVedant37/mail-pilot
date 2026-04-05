from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class FindSlotsRequest(BaseModel):
    attendee_emails: list[str]
    time_min: datetime
    time_max: datetime
    duration_minutes: int = 60
    max_slots: int = 5

class CreateEventRequest(BaseModel):
    summary: str
    start_dt: datetime
    end_dt: datetime
    attendee_emails: list[str]
    description: Optional[str] = ""
    timezone_str: Optional[str] = "Asia/Kolkata"
    send_updates: Optional[str] = "all"

class EventResponse(BaseModel):
    status: str
    event_id: Optional[str] = None
    html_link: Optional[str] = None
    message: str