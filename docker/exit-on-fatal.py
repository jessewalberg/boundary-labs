#!/usr/bin/python3
import os
import subprocess

from supervisor import childutils


def main() -> None:
    while True:
        headers, _payload = childutils.listener.wait()
        childutils.listener.ok()
        if headers.get("eventname") == "PROCESS_STATE_FATAL":
            with open("/tmp/supervisor-fatal", "w", encoding="utf-8") as marker:
                marker.write(headers.get("processname", "unknown"))
            subprocess.run(
                ["/usr/bin/supervisorctl", "-c", "/etc/supervisor/conf.d/boundary.conf", "shutdown"],
                check=False,
                timeout=5,
            )
            return


if __name__ == "__main__":
    main()
