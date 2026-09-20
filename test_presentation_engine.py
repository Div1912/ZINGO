"""
Automated Verification Suite for ZINGO Autonomous Presentation Engine
"""

from presentation_engine import (
    is_presentation_intent,
    get_presentation_system_instruction,
)


def test_presentation_triggers():
    positive_prompts = [
        "Create a professional PPT on refinery energy conservation",
        "Make a presentation for tomorrow's board meeting",
        "Generate a 5-slide slide deck explaining CDU-4 distillation",
        "Build a powerpoint for quarterly HSE compliance",
        "Prepare slides for executive briefing",
        "We need a pitch deck for the new clean energy initiative",
        "Create an executive deck on pipeline integrity",
        "Generate a keynote on sovereign AI architecture",
    ]

    for p in positive_prompts:
        assert is_presentation_intent(p), f"Failed to detect presentation intent for: '{p}'"

    negative_prompts = [
        "Create a todo app with html and javascript",
        "Calculate reboiler heat duty for column C-101",
        "Write a python script to parse CSV sensor logs",
        "Summarize the attached inspection PDF",
        "What is the permissible H2S limit under OISD-156?",
    ]

    for p in negative_prompts:
        assert not is_presentation_intent(p), f"False positive detected for non-presentation: '{p}'"

    print("All presentation intent detection assertions passed!")


def test_presentation_system_instruction():
    instruction = get_presentation_system_instruction()
    assert "PHASE 1: STRATEGIC PRESENTATION PLANNING" in instruction
    assert "PHASE 2: CODE & DATA MANIFEST ARTIFACTS" in instruction
    assert "deck_manifest.json" in instruction
    assert "kpi_metrics" in instruction
    assert "index.html" in instruction

    # With speculative plan from Node 2
    spec_outline = "Slide 1: Title\nSlide 2: Energy Audit Metrics\nSlide 3: Roadmap"
    instruction_with_outline = get_presentation_system_instruction(spec_outline)
    assert "[ARCHITECTURAL BLUEPRINT FROM NODE 2 FAST PLANNER]:" in instruction_with_outline
    assert "Energy Audit Metrics" in instruction_with_outline

    print("All presentation system instruction assertions passed!")


if __name__ == "__main__":
    test_presentation_triggers()
    test_presentation_system_instruction()
    print("\nPresentation Engine Verification: 100% SUCCESS.")
