import { IsNumber, IsString, IsOptional } from 'class-validator';

export class AutoBuildDto {
  @IsNumber()
  budget: number;

  @IsString()
  purpose: string;

  @IsOptional()
  @IsString({ each: true })
  preferredParts?: Part[];
}

export class PCConfiguration {
  CPU: object;
  Motherboard: object;
  RAM: object;
  InternalHardDrive: object;
  GraphicsCard: object;
  PowerSupply: object;
  Case: object;
  CPUCooler: object;
}

export class BudgetAllocation {
  CPU: number;
  Motherboard: number;
  RAM: number;
  InternalHardDrive: number;
  GraphicsCard: number;
  PowerSupply: number;
  Case: number;
  CPUCooler: number;
}

export class Part {
  name: string;
  label: string;
}

export class PartsData {
  CPU: object[];
  Motherboard: object[];
  RAM: object[];
  InternalHardDrive: object[];
  GraphicsCard: object[];
  PowerSupply: object[];
  Case: object[];
  CPUCooler: object[];
}
