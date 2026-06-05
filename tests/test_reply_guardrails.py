from app.services.reply_guardrails import MAX_REPLY_CHARS, sanitize_branching_reply


def test_strips_control_and_null_bytes():
    assert sanitize_branching_reply("a\x00b\x07c") == "abc"


def test_keeps_newlines_and_tabs():
    assert sanitize_branching_reply("a\nb\tc") == "a\nb\tc"


def test_caps_length():
    out = sanitize_branching_reply("x" * (MAX_REPLY_CHARS + 500))
    assert len(out) <= MAX_REPLY_CHARS + 1  # truncated + ellipsis


def test_empty_is_empty():
    assert sanitize_branching_reply("") == ""
