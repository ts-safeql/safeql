import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Person } from "./Person";

@Entity("starship")
export class Starship {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255, nullable: false })
  name: string;

  @ManyToOne(() => Person)
  @JoinColumn({ name: "captain_id" })
  captain: Person;
}
