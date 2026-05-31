import { Sql } from "postgres";

export const GENERATE_POSTGRES_URL = "postgres://postgres:postgres@localhost:5432/postgres";

type SQL = Sql<Record<string, unknown>>;

export function runMigrations(sql: SQL) {
  return sql.unsafe(`
    CREATE TYPE role AS ENUM ('owner', 'admin', 'editor', 'contributor', 'viewer', 'guest');
    CREATE DOMAIN email AS TEXT CHECK (VALUE ~ '^[^@]+@[^@]+[.][^@]+$');

    CREATE TABLE member (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL
    );

    CREATE TABLE member_assignment (
      member_id INTEGER NOT NULL REFERENCES member(id),
      role role NOT NULL
    );

    CREATE TABLE member_email (
      member_id INTEGER NOT NULL REFERENCES member(id),
      email email NOT NULL
    );

    CREATE TABLE team (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        name TEXT NOT NULL
    );

    CREATE TABLE member_team (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        member_id INT NOT NULL REFERENCES member(id),
        team_id INT NOT NULL REFERENCES team(id)
    );

    CREATE TABLE test_date_column (
        date_col DATE NOT NULL,
        date_array date[] NOT NULL,
        instant_arr timestamptz[] NOT NULL,
        time_arr time[] NOT NULL,
        timetz_arr timetz[] NOT NULL,
        local_date_time_arr timestamp[] NOT NULL,
        nullable_date_arr date[] NULL
    );

    CREATE TABLE test_nullability (
      nullable_col TEXT
    );

    CREATE TABLE test_jsonb (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      nullable_col TEXT
    );

    CREATE TYPE overriden_enum AS ENUM ('foo', 'bar');
    
    CREATE TABLE test_overriden_enum (
      col overriden_enum NOT NULL,
      nullable_col overriden_enum
    );

    CREATE DOMAIN overriden_domain AS TEXT CHECK (VALUE ~ '^[0-9]{3}-[0-9]{3}-[0-9]{4}$');

    CREATE TABLE test_overriden_domain (
      col overriden_domain NOT NULL,
      nullable_col overriden_domain
    );

    CREATE TABLE all_types (
      id SERIAL PRIMARY KEY NOT NULL,
      text_column TEXT NOT NULL,
      varchar_column VARCHAR(255) NOT NULL,
      char_column CHAR(10) NOT NULL,
      int_column INTEGER NOT NULL,
      smallint_column SMALLINT NOT NULL,
      bigint_column BIGINT NOT NULL,
      decimal_column DECIMAL(10, 2) NOT NULL,
      numeric_column NUMERIC(14, 4) NOT NULL,
      real_column REAL NOT NULL,
      double_column DOUBLE PRECISION NOT NULL,
      serial_column SERIAL NOT NULL,
      bigserial_column BIGSERIAL NOT NULL,
      boolean_column BOOLEAN NOT NULL,
      date_column DATE NOT NULL,
      time_column TIME NOT NULL,
      time_with_timezone_column TIME WITH TIME ZONE NOT NULL,
      timestamp_column TIMESTAMP NOT NULL,
      timestamp_with_timezone_column TIMESTAMP WITH TIME ZONE NOT NULL,
      interval_column INTERVAL NOT NULL,
      uuid_column UUID NOT NULL,
      json_column JSON NOT NULL,
      jsonb_column JSONB NOT NULL,
      array_text_column TEXT[] NOT NULL,
      array_int_column INTEGER[] NOT NULL,
      bytea_column BYTEA NOT NULL,
      inet_column INET NOT NULL,
      cidr_column CIDR NOT NULL,
      macaddr_column MACADDR NOT NULL,
      macaddr8_column MACADDR8 NOT NULL,
      tsvector_column TSVECTOR NOT NULL,
      tsquery_column TSQUERY NOT NULL,
      xml_column XML NOT NULL,
      point_column POINT NOT NULL,
      line_column LINE NOT NULL,
      lseg_column LSEG NOT NULL,
      box_column BOX NOT NULL,
      path_column PATH NOT NULL,
      polygon_column POLYGON NOT NULL,
      circle_column CIRCLE NOT NULL,
      money_column MONEY NOT NULL,
      bit_column BIT(3) NOT NULL,
      bit_varying_column BIT VARYING(5) NOT NULL
    );

    CREATE TABLE employee (
      id INT NOT NULL,
      data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS table1 (
      id SERIAL PRIMARY KEY,
      name INTEGER NOT NULL
    );

    CREATE SCHEMA IF NOT EXISTS schema1;
    CREATE TABLE IF NOT EXISTS schema1.table1 (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE SCHEMA IF NOT EXISTS schema2;
    CREATE TABLE IF NOT EXISTS schema2.table1 (
      id SERIAL PRIMARY KEY,
      name TEXT
    );
  `);
}
