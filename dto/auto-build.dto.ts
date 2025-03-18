import { IsNumber, IsString, IsOptional } from 'class-validator';

export class AutoBuildDto {
    @IsString()
    userInput: string;

    @IsNumber()
    budget: number;

    @IsNumber()
    initialBudget: number;

    @IsString()
    purpose: string;

    @IsOptional()
    @IsString({ each: true })
    preferredParts?: Part[];
}

export class PCConfiguration {
    CPU: object;
    CPUCooler: object;
    Motherboard: object;
    GraphicsCard: object;
    RAM: object;
    InternalHardDrive: object;
    Case: object;
    PowerSupply: object;
}

export class BudgetAllocation {
    CPU: number;
    CPUCooler: number;
    Motherboard: number;
    GraphicsCard: number;
    RAM: number;
    InternalHardDrive: number;
    Case: number;
    PowerSupply: number;
}

export class Part {
    name: string;
    label: string;
}

export class PartsData {
    CPU: object[];
    CPUCooler: object[];
    Motherboard: object[];
    GraphicsCard: object[];
    RAM: object[];
    InternalHardDrive: object[];
    Case: object[];
    PowerSupply: object[];
}
