import sys
import os
import subprocess
import time
import urllib.request
import urllib.error
import json

def test_sidecar():
    is_windows = sys.platform == "win32"
    ext = ".exe" if is_windows else ""

    # Locate sidecar binary
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    built_path = os.path.join(repo_root, "src-tauri", f"python-sidecar{ext}")

    if not os.path.exists(built_path):
        print(f"Error: Sidecar binary not found at {built_path}")
        sys.exit(1)

    print(f"Starting sidecar binary: {built_path}")

    # Spawn sidecar binary in the background on port 5000
    # On Windows, we need to handle creation flags or shell correctly
    proc = subprocess.Popen([built_path, "--port", "5000", "--mode", "beta"])

    # Wait for startup
    health_url = "http://127.0.0.1:5000/health"
    email_url = "http://127.0.0.1:5000/users/check-email-uniqueness"
    shutdown_url = "http://127.0.0.1:5000/shutdown"

    success = False
    error_msg = ""

    try:
        # Check health endpoint (retry up to 15 times with 1 sec delay)
        print("Waiting for sidecar to start...")
        started = False
        for _ in range(15):
            if proc.poll() is not None:
                # Process exited early
                print(f"Sidecar process exited prematurely with code {proc.returncode}")
                sys.exit(1)
            try:
                with urllib.request.urlopen(health_url, timeout=2) as response:
                    if response.status == 200:
                        print("Sidecar /health check passed.")
                        started = True
                        break
            except Exception:
                time.sleep(1)

        if not started:
            raise RuntimeError("Timed out waiting for sidecar to start.")

        # Test email uniqueness RPC integration
        print("Testing check-email-uniqueness endpoint...")
        req_data = json.dumps({"email": "build-verification-test@example.com"}).encode("utf-8")
        req = urllib.request.Request(
            email_url,
            data=req_data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                print(f"Response: {res_data}")
                if response.status == 200 and "isUnique" in res_data:
                    print("Supabase connection check passed! /check-email-uniqueness works perfectly.")
                    success = True
                else:
                    error_msg = f"Unexpected response format or status: {response.status}, {res_data}"
        except urllib.error.HTTPError as e:
            res_body = e.read().decode("utf-8")
            error_msg = f"HTTP Error {e.code}: {res_body}"
        except Exception as e:
            error_msg = f"Request failed: {e}"

    except Exception as e:
        error_msg = f"Verification flow failed: {e}"

    finally:
        # Shut down sidecar server gracefully
        print("Stopping sidecar...")
        try:
            req = urllib.request.Request(shutdown_url, method="POST")
            with urllib.request.urlopen(req, timeout=3) as response:
                print(f"Shutdown API response: {response.read().decode('utf-8')}")
        except Exception as e:
            print(f"Warning: Failed to call shutdown API ({e}), forcing termination...")
            proc.terminate()

        # Wait for termination
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            print("Forcing process kill...")
            proc.kill()

    if not success:
        print(f"ERROR: Sidecar verification failed. Detail: {error_msg}")
        sys.exit(1)
    else:
        print("Verification complete. All checks passed successfully.")
        sys.exit(0)

if __name__ == "__main__":
    test_sidecar()
