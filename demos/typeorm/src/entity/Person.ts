import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("person")
export class Person {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255, nullable: false })
  name: string;
}
