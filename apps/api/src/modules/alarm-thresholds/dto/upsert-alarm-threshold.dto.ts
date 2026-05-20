import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

@ValidatorConstraint({ name: 'StrictlyDescending', async: false })
export class StrictlyDescendingConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as UpsertAlarmThresholdDto;
    return (
      Number.isInteger(dto.band1Days) &&
      Number.isInteger(dto.band2Days) &&
      Number.isInteger(dto.band3Days) &&
      dto.band1Days > dto.band2Days &&
      dto.band2Days > dto.band3Days &&
      dto.band3Days > 0
    );
  }
  defaultMessage(): string {
    return 'band1Days > band2Days > band3Days > 0 is required (strictly descending)';
  }
}

export class UpsertAlarmThresholdDto {
  @ApiProperty({ description: 'Days before expiry for the outermost (30d) alert band', default: 30 })
  @IsInt()
  @Min(1)
  @Max(365)
  band1Days: number = 30;

  @ApiProperty({ description: 'Days before expiry for the middle (14d) alert band', default: 14 })
  @IsInt()
  @Min(1)
  @Max(365)
  band2Days: number = 14;

  @ApiProperty({ description: 'Days before expiry for the innermost (7d) alert band', default: 7 })
  @IsInt()
  @Min(1)
  @Max(365)
  @Validate(StrictlyDescendingConstraint)
  band3Days: number = 7;
}
