import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '@/lib/db';

interface AppSettingAttributes {
  key: string;
  value: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface AppSettingCreationAttributes extends Optional<AppSettingAttributes, 'createdAt' | 'updatedAt'> {}

class AppSetting extends Model<AppSettingAttributes, AppSettingCreationAttributes> implements AppSettingAttributes {
  public key!: string;
  public value!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

AppSetting.init(
  {
    key: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      allowNull: false,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'false',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'app_settings',
    timestamps: true,
  }
);

export default AppSetting;
