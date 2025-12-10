"""
Rate limiter for API endpoints to prevent abuse
"""

from fastapi import Request, HTTPException
from collections import defaultdict
from datetime import datetime, timedelta


class RateLimiter:
    """
    Simple in-memory rate limiter based on IP address

    Args:
        max_requests: Maximum number of requests allowed per window
        window_hours: Time window in hours for rate limiting
    """

    def __init__(self, max_requests: int = 10, window_hours: int = 24):
        self.max_requests = max_requests
        self.window = timedelta(hours=window_hours)
        self.requests = defaultdict(list)

    async def check_rate_limit(self, request: Request):
        """
        Check if the request exceeds rate limit

        Args:
            request: FastAPI Request object

        Raises:
            HTTPException: If rate limit is exceeded (429 status code)
        """
        ip = request.client.host
        now = datetime.now()

        # Clean old requests outside the time window
        self.requests[ip] = [
            timestamp for timestamp in self.requests[ip]
            if now - timestamp < self.window
        ]

        # Check if rate limit exceeded
        if len(self.requests[ip]) >= self.max_requests:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. You can make {self.max_requests} analyses per day. Try again tomorrow."
            )

        # Add current request timestamp
        self.requests[ip].append(now)
