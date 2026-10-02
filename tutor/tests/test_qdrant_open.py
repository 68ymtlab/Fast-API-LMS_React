"""_open_qdrant: qdrant_data が空・未配置でも、チューターの検索が壊れないこと（メモリ上の検索に切り替わること）のテスト。"""
from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

CORE_DIR = Path(__file__).resolve().parents[1] / "core"
sys.path.insert(0, str(CORE_DIR))

from deeprag_search import COLLECTION_NAME, _open_qdrant  # noqa: E402

REAL_QDRANT = Path(__file__).resolve().parents[1] / "data" / "stage4" / "qdrant_data"


class OpenQdrantTests(unittest.TestCase):
    def test_empty_directory_falls_back_to_in_memory(self):
        # Docker は bind mount 先のディレクトリが無いと、空で作る。その状態でも None（= メモリ上の検索）になること
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(_open_qdrant(d, COLLECTION_NAME))

    def test_missing_directory_does_not_raise(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(_open_qdrant(str(Path(d) / "does" / "not" / "exist"), COLLECTION_NAME))

    def test_collection_with_other_name_falls_back(self):
        if not (REAL_QDRANT / "meta.json").exists():
            self.skipTest("qdrant_data が無い")
        with tempfile.TemporaryDirectory() as d:
            shutil.copytree(REAL_QDRANT, Path(d) / "q", ignore=shutil.ignore_patterns(".lock"))
            self.assertIsNone(_open_qdrant(str(Path(d) / "q"), "no_such_collection"))

    def test_real_data_is_opened(self):
        if not (REAL_QDRANT / "meta.json").exists():
            self.skipTest("qdrant_data が無い")
        with tempfile.TemporaryDirectory() as d:
            shutil.copytree(REAL_QDRANT, Path(d) / "q", ignore=shutil.ignore_patterns(".lock"))
            client = _open_qdrant(str(Path(d) / "q"), COLLECTION_NAME)
            self.assertIsNotNone(client)
            self.assertEqual(client.count(COLLECTION_NAME).count, 672)
            client.close()


if __name__ == "__main__":
    unittest.main()
