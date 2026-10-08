import type { Template } from "@/domain/entities/Template";

export interface ITemplateRepository {
  listForUser(userId: string): Promise<Template[]>;
  findById(id: string): Promise<Template | null>;
  create(t: Omit<Template, "id" | "createdAt" | "updatedAt">): Promise<Template>;
  update(id: string, changes: Partial<Pick<Template, "name" | "ratio" | "pan" | "layers">>): Promise<Template>;
  delete(id: string): Promise<void>;
}
