"""Extract bounded, allowlisted JPEG data from the sandbox's TAP report."""
import base64
import pathlib
import re
import sys

folder = pathlib.Path(sys.argv[1])
report = folder / "browser.tap"
allowed = {"welcome-ja.jpg", "guest-home.jpg", "guest-room.jpg", "mobile-welcome.jpg", "privacy.jpg", "final-state.jpg"}
found = set()
if report.exists():
    for line in report.read_text(encoding="utf-8", errors="replace").splitlines():
        match = re.fullmatch(r"\s*# BROWSER_IMAGE ([a-z-]+\.jpg) ([A-Za-z0-9+/=]+)", line)
        if not match or match[1] not in allowed:
            continue
        image = base64.b64decode(match[2], validate=True)
        if len(image) > 2 * 1024 * 1024 or not image.startswith(b"\xff\xd8\xff"):
            raise ValueError("Invalid or oversized browser screenshot")
        with (folder / match[1]).open("xb") as output:
            output.write(image)
        found.add(match[1])
if "--require-complete" in sys.argv and found != allowed:
    raise ValueError("Missing browser screenshots: " + ", ".join(sorted(allowed - found)))
