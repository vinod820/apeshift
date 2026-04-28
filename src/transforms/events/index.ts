import { applyReplacements, type TransformModule } from "../types.js";

export const eventsTransform: TransformModule = {
  name: "events",
  rulePath: "src/transforms/events/rule.yaml",
  apply(source) {
    return applyReplacements(source, [
      [
        /\btx\.events\["([A-Za-z_][A-Za-z0-9_]*)"\]\[0\]\["([A-Za-z_][A-Za-z0-9_]*)"\]/g,
        "tx.events.filter(contract.$1)[0].$2",
      ],
      [
        /\blen\(tx\.events\["([A-Za-z_][A-Za-z0-9_]*)"\]\)/g,
        "len(tx.events.filter(contract.$1))",
      ],
    ]);
  },
};

export default eventsTransform;
