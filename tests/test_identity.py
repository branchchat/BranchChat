from app.services import identity


def test_identity_is_deterministic_and_opaque():
    a = identity.user_identity("user-1")
    b = identity.user_identity("user-1")
    assert a == b
    assert len(a) == 64  # hex sha256
    assert "user-1" not in a  # not reversible to the input


def test_buckets_are_distinct():
    assert identity.user_identity("x") != identity.anon_identity("x")
    assert identity.anon_identity("x") != identity.network_identity("x")


def test_new_anon_id_is_unique():
    assert identity.new_anon_id() != identity.new_anon_id()
