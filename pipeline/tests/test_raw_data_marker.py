pytest_plugins = ["pytester"]


def test_raw_data_marker_skips_when_a_file_is_absent(pytester):
    pytester.makepyfile(
        """
        import pytest

        @pytest.mark.raw_data("missing/file.csv")
        def test_needs_raw():
            assert False
        """
    )
    result = pytester.runpytest("-p", "raw_data_marker", "-rs")
    result.assert_outcomes(skipped=1)
    result.stdout.fnmatch_lines(["*data/raw/missing/file.csv is absent*"])
