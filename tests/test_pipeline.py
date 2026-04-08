"""
Distill Engine — Regression & Unit Test Suite
Run with: python3 -m pytest tests/test_pipeline.py -v
Or:        python3 tests/test_pipeline.py
"""

import sys
import os
import json
import unittest

# Ensure execution/ is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "execution"))


# ─── Unit: Language Detection ─────────────────────────────────────────────────

class TestLanguageDetection(unittest.TestCase):

    def setUp(self):
        from execution.ingest_source import detect_language
        self.detect = detect_language

    def test_english_title_returns_en(self):
        lang, conf = self.detect("How AI is reshaping the future of work and productivity")
        self.assertEqual(lang, "en")

    def test_italian_title_detected(self):
        lang, conf = self.detect("HO PROVATO LA MEDICINA PIÙ POTENTE DEL MONDO: L'AYAHUASCA")
        self.assertEqual(lang, "it")
        self.assertGreater(conf, 0.08)

    def test_spanish_title_detected(self):
        lang, conf = self.detect("Los mejores consejos para el desarrollo personal y profesional")
        self.assertEqual(lang, "es")
        self.assertGreater(conf, 0.08)

    def test_french_title_detected(self):
        lang, conf = self.detect("Les meilleures stratégies pour améliorer votre productivité")
        self.assertEqual(lang, "fr")
        self.assertGreater(conf, 0.08)

    def test_empty_string_returns_en(self):
        lang, conf = self.detect("")
        self.assertEqual(lang, "en")
        self.assertEqual(conf, 0.0)

    def test_no_false_positive_for_common_words(self):
        # English text that contains borrowed words shouldn't trip detection
        lang, conf = self.detect("The best data-driven approach to company strategy")
        self.assertEqual(lang, "en")


# ─── Unit: Source ID Parsing ──────────────────────────────────────────────────

class TestPodcastAdapterSourceId(unittest.TestCase):

    def setUp(self):
        from execution.adapters.podcast_adapter import PodcastAdapter
        self.adapter = PodcastAdapter()

    def test_spotify_episode_id_extracted(self):
        url = "https://open.spotify.com/episode/1Jh8pos23eTO9uFiBMlUxt?si=abc123"
        source = self.adapter.normalize(url, shell=True)
        self.assertEqual(source.source_id, "spotify_1Jh8pos23eTO9uFiBMlUxt")

    def test_spotify_shell_title_not_empty(self):
        url = "https://open.spotify.com/episode/4YPZzidQZYw3VGpLY76Cw2"
        source = self.adapter.normalize(url, shell=True)
        self.assertIsNotNone(source.title)
        self.assertNotEqual(source.title, "")

    def test_spotify_source_type_set(self):
        url = "https://open.spotify.com/episode/1Jh8pos23eTO9uFiBMlUxt"
        source = self.adapter.normalize(url, shell=True)
        self.assertEqual(source.source_type, "spotify_podcast")

    def test_apple_episode_id_extracted(self):
        url = "https://podcasts.apple.com/us/podcast/lex-fridman-podcast/id1414462524?i=1000698765432"
        source = self.adapter.normalize(url, shell=True)
        self.assertEqual(source.source_id, "apple_1000698765432")

    def test_apple_show_id_fallback(self):
        url = "https://podcasts.apple.com/us/podcast/lex-fridman-podcast/id1414462524"
        source = self.adapter.normalize(url, shell=True)
        self.assertEqual(source.source_id, "apple_1414462524")


# ─── Unit: YouTube Adapter ────────────────────────────────────────────────────

class TestYouTubeAdapterDetect(unittest.TestCase):

    def setUp(self):
        from execution.adapters.youtube_adapter import YouTubeAdapter
        self.adapter = YouTubeAdapter()

    def test_standard_youtube_url_detected(self):
        self.assertTrue(self.adapter.detect("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))

    def test_short_youtube_url_detected(self):
        self.assertTrue(self.adapter.detect("https://youtu.be/dQw4w9WgXcQ"))

    def test_spotify_url_not_detected(self):
        self.assertFalse(self.adapter.detect("https://open.spotify.com/episode/abc123"))

    def test_apple_url_not_detected(self):
        self.assertFalse(self.adapter.detect("https://podcasts.apple.com/us/podcast/id123"))


# ─── Unit: transcript_harvester — finish_transcript ──────────────────────────

class TestFinishTranscript(unittest.TestCase):

    def setUp(self):
        import tempfile
        self.tmp = tempfile.mkdtemp()
        # Create a minimal sources file so load_source_metadata can find the title
        sources_dir = os.path.join(self.tmp, "execution", ".tmp", "sources")
        os.makedirs(sources_dir, exist_ok=True)
        with open(os.path.join(sources_dir, "test_src.json"), "w") as f:
            json.dump([{"source_id": "test_src", "title": "My Real Podcast Title"}], f)

    def test_returns_required_keys(self):
        import tempfile
        from execution.transcript_harvester import finish_transcript

        out_dir = tempfile.mkdtemp()
        result = finish_transcript("test_src", [{"text": "Hello world", "start": 0.0, "duration": 1.0}], out_dir)

        self.assertIn("source_id", result)
        self.assertIn("status", result)
        self.assertIn("segments", result)
        self.assertIn("json_path", result)
        self.assertIn("text_path", result)

    def test_segments_truncated_at_100(self):
        import tempfile
        from execution.transcript_harvester import finish_transcript

        segments = [{"text": f"seg {i}", "start": float(i), "duration": 1.0} for i in range(200)]
        out_dir = tempfile.mkdtemp()
        result = finish_transcript("test_src2", segments, out_dir)
        self.assertLessEqual(len(result["segments"]), 100)

    def test_json_file_written(self):
        import tempfile
        from execution.transcript_harvester import finish_transcript

        out_dir = tempfile.mkdtemp()
        result = finish_transcript("test_src3", [{"text": "Test", "start": 0.0, "duration": 1.0}], out_dir)
        self.assertTrue(os.path.exists(result["json_path"]))


# ─── Unit: ingest_source — result structure ──────────────────────────────────

class TestIngestSource(unittest.TestCase):

    def test_ingest_result_has_language_fields(self):
        """Ensure ingest_source result always includes language detection fields."""
        import tempfile, json
        from unittest.mock import patch

        source_id = "test_lang_src"
        meta = {
            "source_id": source_id,
            "source_type": "youtube",
            "title": "HO PROVATO LA MEDICINA PIÙ POTENTE DEL MONDO",
            "description": "Un documentario sulla medicina tradizionale",
            "duration_seconds": 1800,
            "is_shell": False,
            "source_confidence": 0.95,
        }

        with patch("execution.ingest_source.find_source", return_value=meta):
            from execution import ingest_source as ingest_mod
            import io
            from contextlib import redirect_stdout

            output = io.StringIO()
            with redirect_stdout(output):
                ingest_mod.ingest_source(source_id)

            result = json.loads(output.getvalue().strip())

        self.assertIn("detected_language", result)
        self.assertIn("language_warning", result)
        self.assertEqual(result["detected_language"], "it")
        self.assertIsNotNone(result["language_warning"])

    def test_english_source_has_no_warning(self):
        import json
        from unittest.mock import patch

        source_id = "test_en_src"
        meta = {
            "source_id": source_id,
            "source_type": "youtube",
            "title": "How AI is reshaping the future of work and productivity forever",
            "description": "A deep dive into artificial intelligence and the economy",
            "duration_seconds": 3600,
            "is_shell": False,
            "source_confidence": 0.95,
        }

        with patch("execution.ingest_source.find_source", return_value=meta):
            from execution import ingest_source as ingest_mod
            import io
            from contextlib import redirect_stdout

            output = io.StringIO()
            with redirect_stdout(output):
                ingest_mod.ingest_source(source_id)

            result = json.loads(output.getvalue().strip())

        self.assertEqual(result["detected_language"], "en")
        self.assertIsNone(result["language_warning"])


# ─── Integration: Merge Segments ─────────────────────────────────────────────

class TestMergeSegments(unittest.TestCase):

    def setUp(self):
        from execution.transcript_harvester import merge_segments
        self.merge = merge_segments

    def test_no_merge_when_under_limit(self):
        segs = [{"text": f"s{i}", "start": float(i), "duration": 1.0} for i in range(10)]
        result = self.merge(segs, 60)
        self.assertEqual(len(result), 10)

    def test_merge_to_max_segments(self):
        segs = [{"text": f"seg {i}", "start": float(i), "duration": 1.0} for i in range(200)]
        result = self.merge(segs, 60)
        self.assertLessEqual(len(result), 60)

    def test_empty_input_returns_empty(self):
        self.assertEqual(self.merge([], 60), [])

    def test_merged_segments_preserve_timing(self):
        segs = [{"text": f"s{i}", "start": float(i), "duration": 1.0} for i in range(10)]
        result = self.merge(segs, 5)
        # First segment should start at 0
        self.assertEqual(result[0]["start"], 0.0)
        # All merged segments must have text
        for seg in result:
            self.assertTrue(len(seg["text"]) > 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
