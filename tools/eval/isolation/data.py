"""Synthetic tenants for the isolation suite: one unique planted code word each, plus ordinary facts.
Every document is under 100 words, so each stays one chunk and the chunk starts with the document's first words."""

from dataclasses import dataclass


@dataclass(frozen=True)
class TenantSpec:
    label: str  # "A" or "B"
    brand: str
    code: str  # the planted code word, present in no other tenant's text
    docs: dict  # filename -> text
    facts: tuple  # (question, filename that answers it)
    topics: tuple  # topic phrases other tenants ask about


TENANT_A = TenantSpec(
    "A",
    "Northwind Bakery",
    "AMBERFOX-4417",
    {
        "amberfox_codeword.txt": (
            "Code word: AMBERFOX-4417. Northwind Bakery uses the code word AMBERFOX-4417 to confirm "
            "wholesale orders by phone. Never share the code word outside the Northwind Bakery "
            "wholesale team. The code word is rotated every January by the head baker."
        ),
        "northwind_hours_and_delivery.txt": (
            "Northwind Bakery opening hours: weekdays 6:00 AM to 4:00 PM, Saturdays 7:00 AM to 1:00 PM, "
            "closed Sundays. Delivery covers a radius of 12 km from the Willow Street shop, free for "
            "orders above 40 euros, otherwise a fee of 4 euros. Sourdough loaves must be ordered "
            "24 hours ahead."
        ),
        "northwind_menu_and_allergens.txt": (
            "Northwind Bakery menu: sourdough loaf 5.50 euros, rye roll 1.20 euros, cardamom bun "
            "2.80 euros. All breads contain gluten. The cardamom bun contains milk and almonds. Gift "
            "boxes of twelve buns cost 28 euros. Custom birthday cakes need three days notice."
        ),
    },
    (
        ("What are the opening hours on Saturdays?", "northwind_hours_and_delivery.txt"),
        ("How far does delivery reach and when is it free?", "northwind_hours_and_delivery.txt"),
        ("How much does a sourdough loaf cost?", "northwind_menu_and_allergens.txt"),
        ("Which allergens does the cardamom bun contain?", "northwind_menu_and_allergens.txt"),
        ("How much notice does a custom birthday cake need?", "northwind_menu_and_allergens.txt"),
        ("Who rotates the wholesale code word and when?", "amberfox_codeword.txt"),
    ),
    (
        "sourdough loaf price",
        "cardamom bun allergens",
        "bakery delivery radius",
        "birthday cake notice",
    ),
)

TENANT_B = TenantSpec(
    "B",
    "Cobalt Marine Supply",
    "COBALTOWL-9082",
    {
        "cobaltowl_codeword.txt": (
            "Code word: COBALTOWL-9082. Cobalt Marine Supply uses the code word COBALTOWL-9082 to "
            "authorize emergency parts shipments to the harbor. Never share the code word outside the "
            "Cobalt Marine Supply dispatch team. The code word is changed every July by the dispatch "
            "manager."
        ),
        "cobalt_mooring_and_fees.txt": (
            "Cobalt Marine Supply mooring fees: 18 dollars per night for boats under 8 meters and 31 "
            "dollars per night for larger boats. Fuel dock open daily 7:00 AM to 7:00 PM. Winter "
            "storage requires a deposit of 250 dollars. Pump-out service is available at pier three."
        ),
        "cobalt_repairs_and_warranty.txt": (
            "Cobalt Marine Supply repair terms: outboard engine repairs carry a 90 day warranty on "
            "parts and labor. Diagnostic inspection costs 65 dollars and is credited toward the "
            "repair. Propeller replacement takes two working days. Warranty does not cover damage "
            "from running aground."
        ),
    },
    (
        ("What is the mooring fee per night for a small boat?", "cobalt_mooring_and_fees.txt"),
        ("When is the fuel dock open?", "cobalt_mooring_and_fees.txt"),
        ("How big is the winter storage deposit?", "cobalt_mooring_and_fees.txt"),
        ("How long is the outboard engine repair warranty?", "cobalt_repairs_and_warranty.txt"),
        ("What does a diagnostic inspection cost?", "cobalt_repairs_and_warranty.txt"),
        ("Who changes the dispatch code word and when?", "cobaltowl_codeword.txt"),
    ),
    (
        "mooring fee per night",
        "outboard engine warranty",
        "winter storage deposit",
        "fuel dock hours",
    ),
)
