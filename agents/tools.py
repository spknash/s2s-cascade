"""Deterministic fake back office for 'Maple Court Apartments'.

Both agents call exactly these functions, so a tool-call comparison is apples to apples.
State is per-process and reset on each session; nothing here talks to a real system.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date, timedelta

UNITS = [
    {"unit": "2B", "beds": 1, "baths": 1, "sqft": 640, "rent": 1495, "available": "2026-11-15"},
    {"unit": "3C", "beds": 1, "baths": 1, "sqft": 680, "rent": 1550, "available": "2026-12-01"},
    {"unit": "5A", "beds": 2, "baths": 2, "sqft": 940, "rent": 2150, "available": "2026-11-20"},
    {"unit": "7D", "beds": 2, "baths": 1, "sqft": 880, "rent": 1990, "available": "2026-12-05"},
    {"unit": "9B", "beds": 3, "baths": 2, "sqft": 1210, "rent": 2795, "available": "2027-01-01"},
]

OFFICE_HOURS = {
    "monday": "9am to 6pm",
    "tuesday": "9am to 6pm",
    "wednesday": "9am to 6pm",
    "thursday": "9am to 6pm",
    "friday": "9am to 6pm",
    "saturday": "10am to 4pm",
    "sunday": "closed",
}


@dataclass
class BackOffice:
    tours: list[dict] = field(default_factory=list)
    tickets: list[dict] = field(default_factory=list)
    _rng: random.Random = field(default_factory=lambda: random.Random(7))

    def check_availability(self, bedrooms: int | None = None, move_in: str | None = None) -> dict:
        units = [u for u in UNITS if bedrooms is None or u["beds"] == bedrooms]
        if move_in:
            try:
                want = date.fromisoformat(move_in)
                units = [u for u in units if date.fromisoformat(u["available"]) <= want + timedelta(days=14)]
            except ValueError:
                pass
        return {"count": len(units), "units": units}

    def schedule_tour(self, name: str, day: str, time: str, unit: str | None = None) -> dict:
        tour_id = f"T-{self._rng.randint(1000, 9999)}"
        rec = {"tour_id": tour_id, "name": name, "day": day, "time": time, "unit": unit or "any"}
        self.tours.append(rec)
        return {"status": "booked", **rec, "note": "Bring a photo ID. The leasing office is at building 1."}

    def file_maintenance_request(self, unit: str, issue: str, urgency: str = "normal") -> dict:
        ticket = f"MR-{self._rng.randint(10000, 99999)}"
        eta = "within 24 hours" if urgency == "urgent" else "within 3 business days"
        rec = {"ticket": ticket, "unit": unit, "issue": issue, "urgency": urgency, "eta": eta}
        self.tickets.append(rec)
        return {"status": "filed", **rec}

    def office_hours(self, day: str | None = None) -> dict:
        if day:
            d = day.lower()
            return {"day": d, "hours": OFFICE_HOURS.get(d, "unknown day")}
        return {"hours": OFFICE_HOURS}
