def enqueue_export(job_payload):
    print("enqueue_export called - job payload keys:", list(job_payload.keys()))
    return {"job_id": "placeholder", "status": "enqueued"}
