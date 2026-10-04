# -*- coding: utf-8 -*-
PFAD = 'src/services/zeit.js'

ALT_A = """            emp.rentman_id,
            (SELECT rentman_id FROM employees WHERE id = te.erfasst_von) AS erfasser_rentman_id
       FROM time_entries te JOIN employees emp ON emp.id = te.employee_id"""
NEU_A = """            emp.rentman_id
       FROM time_entries te JOIN employees emp ON emp.id = te.employee_id"""

ALT_B = """  if (istKrankheit && lrId) {
    await api('PUT', '/leaverequest/' + lrId,
      { requested_for: crew, approval_status: 'approved', reviewer: e.erfasser_rentman_id,
        description: `Krankentag ${e.start_tag} (Mitarbeiterportal)` });
  }"""
NEU_B = """  // reviewer bewusst NICHT gesetzt: Rentman weist den Pruefer serverseitig
  // dem API-Dienstaccount zu (crew 235, "OpenAPI" in der Portal-Anzeige) --
  // ein selbst uebergebener reviewer-Wert fuehrte zu "instance failed to
  // match exactly one schema" (28.09.2026, per curl-Trockentest bestaetigt).
  if (istKrankheit && lrId) {
    await api('PUT', '/leaverequest/' + lrId,
      { requested_for: crew, approval_status: 'approved',
        description: `Krankentag ${e.start_tag} (Mitarbeiterportal)` });
  }"""

with open(PFAD, encoding='utf-8') as f:
    inhalt = f.read()

for alt, neu, name in [(ALT_A, NEU_A, 'A'), (ALT_B, NEU_B, 'B')]:
    n = inhalt.count(alt)
    assert n == 1, f"Anker {name}: {n}x gefunden statt 1x"
    inhalt = inhalt.replace(alt, neu)

with open(PFAD, 'w', encoding='utf-8') as f:
    f.write(inhalt)

print('OK -- Anker A und B gepatcht')
