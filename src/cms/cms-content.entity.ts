import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ContentType {
    HERO_BANNER = 'hero_banner',
    TEAM_MEMBER = 'team_member',
    LOGO = 'logo',
    PROMO_BANNER = 'promo_banner',
    ABOUT_IMAGE = 'about_image',
    BRAND = 'brand', // Add the BRAND content type
}

export enum ContentSection {
    HOME = 'home',
    ABOUT = 'about',
    SUPPORT = 'support',
    FOOTER = 'footer',
    HEADER = 'header',
}

export enum ContentStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
}

@Entity('CMS_Content')
export class CmsContent {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    contentKey: string;

    @Column()
    contentType: ContentType;

    @Column({ nullable: true })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ nullable: true })
    imageUrl: string;

    @Column({ nullable: true })
    cloudinaryPublicId: string;

    @Column({ nullable: true })
    link: string;

    @Column()
    section: ContentSection;

    @Column({ default: ContentStatus.ACTIVE })
    status: ContentStatus;

    @Column({ default: 0 })
    displayOrder: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
