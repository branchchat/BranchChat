from app.schemas.chat import LinkedContextBlock, ProviderMessage
from app.services import prompt


def test_normalize_drops_system_and_empty():
    history = [
        ProviderMessage(role="system", content="root welcome"),
        ProviderMessage(role="user", content="hi"),
        ProviderMessage(role="assistant", content=""),
    ]
    out = prompt.normalize_history(history, coding_mode=False)
    assert [m.role for m in out] == ["user"]


def test_normalize_caps_message_count():
    history = [ProviderMessage(role="user", content=f"m{i}") for i in range(50)]
    out = prompt.normalize_history(history, coding_mode=False)
    assert len(out) <= 20


def test_normalize_char_budget_keeps_most_recent():
    history = [
        ProviderMessage(role="user", content="x" * 30_000),
        ProviderMessage(role="assistant", content="recent"),
    ]
    out = prompt.normalize_history(history, coding_mode=False)
    assert out[-1].content == "recent"
    assert all(len(m.content) < 30_000 for m in out)


def test_linked_blocks_are_labelled():
    blocks = [
        LinkedContextBlock(
            source_node_id="n1",
            source_label="Results",
            messages=[
                ProviderMessage(role="user", content="q"),
                ProviderMessage(role="assistant", content="a"),
            ],
        )
    ]
    s = prompt.format_linked_blocks(blocks)
    assert "Linked context: Results" in s
    assert "q" in s and "a" in s


def test_system_instruction_carries_branchchat_creator_facts():
    # The base policy must let any model answer "who made you / what is this"
    # from real facts instead of disclaiming.
    s = prompt.build_system_instruction(
        coding_mode=False, personalization=None, linked_context=[]
    )
    assert "Roshaan Chaudhry" in s
    assert "Jayden Tumboken" in s
    assert "Stevens Institute of Technology" in s


def test_system_instruction_composes_parts():
    blocks = [
        LinkedContextBlock(
            source_node_id="n1",
            messages=[ProviderMessage(role="user", content="q")],
        )
    ]
    s = prompt.build_system_instruction(
        coding_mode=True, personalization="be terse", linked_context=blocks
    )
    assert "coding mode" in s.lower()
    assert "be terse" in s
    assert "SUPPLEMENTAL" in s  # linked-context rules engaged
