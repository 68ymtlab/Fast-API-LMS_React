"""store.student_lock の「1人の連打が他の学生を止めない」ための制御のテスト（DB 不要。偽のプールを使う）。"""
from __future__ import annotations

import sys
import threading
import unittest
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_DIR))

from psycopg_pool import PoolTimeout  # noqa: E402
from store import LockUnavailable, StudentBusy, TutorStore  # noqa: E402


class FakeConn:
    def __init__(self, log):
        self.log = log

    def execute(self, sql, params=None):
        self.log.append(("execute", sql.split("(")[0].strip(), params))

    def commit(self):
        self.log.append(("commit",))


class FakePool:
    """getconn / putconn だけを持つ。max 本まで貸し出し、超えたら PoolTimeout。"""

    def __init__(self, max_conns=16):
        self.max = max_conns
        self.out = 0
        self.log = []
        self._g = threading.Lock()
        self.getconn_calls = 0

    def getconn(self, timeout=None):
        with self._g:
            self.getconn_calls += 1
            if self.out >= self.max:
                raise PoolTimeout("no free connection")
            self.out += 1
        return FakeConn(self.log)

    def putconn(self, conn):
        with self._g:
            self.out -= 1


def make_store(max_inflight=3, max_conns=16):
    s = TutorStore("postgresql://unused")
    s.lock_pool = FakePool(max_conns)
    s.max_inflight = max_inflight
    return s


class StudentLockTests(unittest.TestCase):
    def test_normal_use_releases_everything(self):
        s = make_store()
        with s.student_lock(1):
            self.assertEqual(s.lock_pool.out, 1)
            self.assertEqual(s._inflight, {1: 1})
        self.assertEqual(s.lock_pool.out, 0)
        self.assertEqual(s._inflight, {})
        kinds = [e[1] for e in s.lock_pool.log if e[0] == "execute"]
        self.assertEqual(kinds, ["SELECT pg_advisory_lock", "SELECT pg_advisory_unlock"])

    def test_released_when_body_raises(self):
        s = make_store()
        with self.assertRaises(RuntimeError):
            with s.student_lock(1):
                raise RuntimeError("boom")
        self.assertEqual(s.lock_pool.out, 0)
        self.assertEqual(s._inflight, {})
        # アンロックも実行される
        kinds = [e[1] for e in s.lock_pool.log if e[0] == "execute"]
        self.assertEqual(kinds[-1], "SELECT pg_advisory_unlock")

    def test_over_limit_is_rejected_immediately_without_taking_a_connection(self):
        s = make_store(max_inflight=2)
        started = threading.Barrier(3)
        release = threading.Event()

        def hold():
            with s.student_lock(1):
                started.wait(timeout=5)
                release.wait(timeout=5)

        ts = [threading.Thread(target=hold) for _ in range(2)]
        for t in ts:
            t.start()
        # 2本が入るまで待つ（Barrier は呼び出し側を含めて3）
        started.wait(timeout=5)
        calls_before = s.lock_pool.getconn_calls
        with self.assertRaises(StudentBusy):
            with s.student_lock(1):
                self.fail("上限を超えたリクエストが入ってはいけない")
        self.assertEqual(s.lock_pool.getconn_calls, calls_before, "断るときに接続を取ってはいけない")
        self.assertEqual(s.lock_pool.out, 2, "断られたリクエストが接続を握っていない")
        release.set()
        for t in ts:
            t.join(timeout=5)
        self.assertEqual(s.lock_pool.out, 0)
        self.assertEqual(s._inflight, {})
        # 解放後は再び入れる
        with s.student_lock(1):
            pass

    def test_one_student_cannot_starve_others(self):
        # ロック用接続 4 本・1人の上限 2。学生1がいくら送っても、学生2 の分の接続は残る
        s = make_store(max_inflight=2, max_conns=4)
        gate = threading.Event()
        entered = threading.Semaphore(0)

        def hold():
            try:
                with s.student_lock(1):
                    entered.release()
                    gate.wait(timeout=5)
            except StudentBusy:
                entered.release()

        ts = [threading.Thread(target=hold) for _ in range(10)]  # 学生1が10本同時に送る
        for t in ts:
            t.start()
        for _ in range(10):
            entered.acquire(timeout=5)
        self.assertLessEqual(s.lock_pool.out, 2, "学生1が握れる接続は上限までのはず")
        with s.student_lock(2):  # 普通の学生は待たずに入れる
            self.assertLessEqual(s.lock_pool.out, 3)
        gate.set()
        for t in ts:
            t.join(timeout=5)
        self.assertEqual(s.lock_pool.out, 0)
        self.assertEqual(s._inflight, {})

    def test_pool_exhausted_raises_lock_unavailable_and_releases_counter(self):
        s = make_store(max_inflight=3, max_conns=1)
        with s.student_lock(1):
            with self.assertRaises(LockUnavailable):
                with s.student_lock(2):  # 全体で接続が尽きている
                    self.fail("入れてはいけない")
            self.assertEqual(s._inflight, {1: 1}, "失敗した学生2のカウンタが残っていない")
        self.assertEqual(s.lock_pool.out, 0)
        self.assertEqual(s._inflight, {})

    def test_disabled_store_is_noop(self):
        s = TutorStore(None)
        with s.student_lock(1):
            pass


if __name__ == "__main__":
    unittest.main()
