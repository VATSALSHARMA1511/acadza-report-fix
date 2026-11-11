# Defects nobody reported

Found by sweeping all 43 questions the same way the engine checks reported ones. None has a student report.

| # | Severity | Kind | Where | What |
|---|---|---|---|---|
| 1 | high | `solution_fix` | Zoology · Chemical Coordination and Integration (`66fe9dbe22132e5a70a3e579`) | Stored solution says 'Insulin and glucagon work synergistically', but option B of the same question lists them as an antagonistic pair (they are antagonists). A student reading the solution learns the opposite fact. |
| 2 | high | `unsound` | Physics · Waves (`695ee00b88d7701e561aabc5`) | The solution contradicts itself: calls Assertion false, derives I = I0 and calls it true, then keys D. Already raised via R034. |
| 3 | medium | `solution_missing` | Physics · Electrostatics (`68c8153cfb6b2f16e2d3ceaf`) | Solution is a three-word fragment ('conceptual Based of field force') with no reasoning for any of the four statements. |
| 4 | medium | `notation` | Physics · Geometrical optics and optical instruments (`68dea657387eea3d0d95f54a`) | Solution subscripts are garbled: 'P_eqcu' and 'P_eqch' appear where 'P_each' (power of each lens) was meant. |
| 5 | medium | `notation` | Physics · Temperature and thermal properties of matter (`6062ec84518e9535e120c422`) | Solution units are corrupted: '1.9x10^-5 /AC' and '5.7x10^-5 /CC' where '/°C' was meant (degree sign lost). |
| 6 | medium | `solution_fix` | Physics · Wave optics (`68dea7c2387eea3d0d95f9bb`) | Solution ends at '= 0.08 m' while the key is 8 (cm). Missing the final conversion caused R032. Suggest appending '= 8 cm'. |
| 7 | low | `spelling` | Zoology · Digestion and Absorption (`61ee6c9d90a1a968a168686b`) | Solution typos: 'prominant' (prominent), 'Maceus' (Mucous). |
| 8 | low | `spelling` | Zoology · Evolution (`620e23cecc50543bc7db9186`) | Solution typos: 'wheater' (whether), 'than' for 'then'. |
| 9 | low | `spelling` | Physics · Properties of matter and fluid mechanics (`622df25ab70e4b50e44ff837`) | Stem typo: 'hemispherial' (hemispherical). |
| 10 | low | `spelling` | Zoology · Biotechnology and its Applications (`6264197209f4fd65f58f5707`) | Option B reads 'Canolla' (Canola); the solution has run-together words ('riceis', 'producebeta-carotene'). |
| 11 | low | `spelling` | Botany · Morphology of Flowering Plants (`617fa18efd53ff1629ed890f`) | Missing space: 'part of' and 'leaf' are glued ('ofleaf') by a stray span. |
| 12 | low | `noise` | Physics · Motion in a Plane (`6956d7bb23cb221e570d6013`) | Solution starts with the stray label 'Solution:' and '(b)'. |
| 13 | low | `wrong_chapter` | Physics · Mathematics in physics (`68f21caf941cda588bc04365`) | Nuclei decay / mean life is filed under 'Mathematics in physics -> Linear function'; probably belongs to Nuclear physics and radioactivity. |
