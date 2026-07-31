import asyncio
import concurrent.futures
import time

class ParallelExecutionEngine:
    def __init__(self, max_workers: int = 8):
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=max_workers)

    def _evaluate(self, student_id):
        time.sleep(1)
        return {"student_id": student_id, "status": "GRADED", "score": 98.5}

    async def run_async(self, student_id):
        loop = asyncio.get_running_loop()
        res = await loop.run_in_executor(self.executor, self._evaluate, student_id)
        return res
