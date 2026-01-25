"""
Structured logging configuration for production environments.

Provides JSON-formatted logs with contextual information for
monitoring, debugging, and audit trails.
"""

import logging
import sys
import json
from datetime import datetime
from typing import Dict, Any


class JSONFormatter(logging.Formatter):
    """
    Custom JSON formatter for structured logging.

    Outputs log records as JSON objects with timestamp, level, message,
    module context, and optional exception information.
    """

    def format(self, record: logging.LogRecord) -> str:
        """
        Format log record as JSON string.

        Args:
            record: LogRecord to format

        Returns:
            JSON-formatted log string
        """
        log_object: Dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        }

        # Add exception info if present
        if record.exc_info:
            log_object["exception"] = self.formatException(record.exc_info)

        # Add extra fields from logger.info(..., extra={...})
        if hasattr(record, '__dict__'):
            for key, value in record.__dict__.items():
                if key not in ['name', 'msg', 'args', 'created', 'filename', 'funcName',
                               'levelname', 'levelno', 'lineno', 'module', 'msecs',
                               'message', 'pathname', 'process', 'processName',
                               'relativeCreated', 'thread', 'threadName', 'exc_info',
                               'exc_text', 'stack_info']:
                    log_object[key] = value

        return json.dumps(log_object)


def setup_logging(log_level: str = "INFO", json_format: bool = True):
    """
    Configure application logging with structured output.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        json_format: If True, use JSON formatter; if False, use standard format
    """
    # Get root logger
    logger = logging.getLogger()
    logger.setLevel(getattr(logging, log_level.upper()))

    # Remove existing handlers
    logger.handlers.clear()

    # Create console handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(getattr(logging, log_level.upper()))

    # Set formatter
    if json_format:
        formatter = JSONFormatter()
    else:
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )

    handler.setFormatter(formatter)
    logger.addHandler(handler)

    # Set log levels for noisy third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)

    logger.info(
        "Logging configured",
        extra={
            "log_level": log_level,
            "json_format": json_format
        }
    )
