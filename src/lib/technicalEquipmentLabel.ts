export function technicalEquipmentLabel(order: { model?: string | null; equipment?: string | null }): string {
  return order.model?.trim() || order.equipment?.trim() || '-';
}