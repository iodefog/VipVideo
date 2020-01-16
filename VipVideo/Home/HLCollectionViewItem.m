//
//  HLCollectionViewItem.m
//  VipVideo
//
//  Created by 李红力 on 2020/1/10.
//  Copyright © 2020 SV. All rights reserved.
//

#import "HLCollectionViewItem.h"

@implementation NSVideoButton

@end


@interface HLCollectionViewItem ()

@end

@implementation HLCollectionViewItem
@dynamic selected;

- (void)viewDidLayout{
    [super viewDidLayout];
    self.button.frame = CGRectMake(5, 5, CGRectGetWidth(self.view.bounds)-10, CGRectGetHeight(self.view.bounds)-10);
    self.button.layer.backgroundColor = NSColor.whiteColor.CGColor;
}

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do view setup here.
    
    if (self.button == nil) {
        self.button = [[NSVideoButton alloc] init];
        [self.button setBezelStyle:NSBezelStyleInline];
        self.button.target = self;
        self.button.wantsLayer = YES;
        self.button.action = @selector(buttonClicked:);
        
        [self.view addSubview:self.button];
    }
}

- (void)setObject:(VipUrlItem *)object{
    _object = object;
    
    [self.button setTitle:object.title];

    if (object.selected) {
        self.button.highlighted = YES;
    }else {
        self.button.highlighted = NO;
    }
}

- (void)buttonClicked:(NSVideoButton *)sender{
    if (self.itemBlock) {
        self.object.selected = YES;
        self.itemBlock(self.object, self.indexPath);
    }
}


@end
